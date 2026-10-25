import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { calculateShippingCost } from "../shared/pricing";
import { dpdParcelSchema, getShippingIssues } from "../shared/shipping-details";
import { updateJobSchema } from "../shared/schema";

const base = {
  id: "job1", jobName: "Test order", customerId: "customer", invoiceStatus: "ready", completed: true,
  shippingMethod: null, shippingCost: null, dhlTrackingNumber: null, packageCount: null, packageType: null,
  consolidatedShipmentId: null, dispatchEmailSentAt: null, dispatchEmailQueuedAt: null,
};

test("missing dispatch details warn even when a tracking number exists", () => {
  const [issue] = getShippingIssues([{ ...base, dhlTrackingNumber: "tracking" }]);
  assert.equal(issue.reasons.length, 3);
  assert.ok(issue.reasons.some(reason => reason.includes("Carriage")));
  assert.equal(getShippingIssues([base])[0].reasons.length, 4);
});

test("complete parcels, collection and free local delivery do not produce false warnings", () => {
  for (const method of ["customer_collection", "free_local"]) {
    assert.equal(getShippingIssues([{ ...base, shippingMethod: method }]).length, 0);
  }
  assert.equal(getShippingIssues([{
    ...base, shippingMethod: "direct_delivery", packageCount: 1, packageType: "boxes",
    dhlTrackingNumber: "tracking", shippingCost: "7.5",
  }]).length, 0);
});

test("consolidation uses one charge and respects carriage already invoiced", () => {
  const first = { ...base, shippingMethod: "consolidated", dhlTrackingNumber: "tracking", packageCount: 2, packageType: "boxes", shippingCost: "10", consolidatedShipmentId: "group" };
  const second = { ...first, id: "job2", shippingCost: null };
  assert.equal(getShippingIssues([first, second]).length, 0);
  assert.equal(getShippingIssues([second], [first, second]).length, 1);
  assert.equal(getShippingIssues([second], [{ ...first, invoiceStatus: "invoiced" }, second]).length, 0);
  assert.equal(getShippingIssues([second], [{ ...first, customerId: "unrelated" }, second]).length, 1);
});

test("TBA costs require an explicit valid manual charge; zero is an explicit waiver", () => {
  const job = { ...base, shippingMethod: "direct_delivery", dhlTrackingNumber: "tracking", packageCount: 5, packageType: "boxes", shippingCost: "TBA" };
  assert.equal(getShippingIssues([job]).length, 1);
  assert.equal(getShippingIssues([job], [job], { job1: "25" }).length, 0);
  assert.equal(getShippingIssues([{ ...job, shippingCost: "0" }]).length, 0);
  assert.equal(getShippingIssues([{ ...job, shippingCost: "-1" }]).length, 1);
});

test("DPD parcel counts and parcel types are validated before booking", () => {
  for (const count of [0, -1, 1.5, 51]) assert.equal(dpdParcelSchema.safeParse({ packageCount: count, packageType: "box" }).success, false);
  assert.equal(dpdParcelSchema.safeParse({ packageCount: 1, packageType: "unknown" }).success, false);
  assert.equal(dpdParcelSchema.parse({ packageCount: "2", packageType: "bag" }).packageCount, 2);
});

test("unrelated job updates must not clear a saved parcel count", () => {
  assert.equal(updateJobSchema.parse({ dhlTrackingNumber: "UPDATED-TRACKING" }).packageCount, undefined);
  assert.equal(updateJobSchema.parse({ packageCount: null }).packageCount, null);
  assert.equal(updateJobSchema.parse({ packageCount: "2" }).packageCount, 2);
});

function extractFunctions(file: string, names: string[]) {
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text || "")) found.push(node.getText(source).replace(/^export /, ""));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(found.length, names.length);
  return found.join("\n");
}
const savedFunctions = extractFunctions("./dpdShipmentDetails.ts", ["buildBookedDpdDetails", "saveBookedDpdDetails"]);
const routes = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
let bookingHandler = "";
function visitRoutes(node: ts.Node) {
  if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === "/api/dpd/book-shipment") bookingHandler = node.arguments[node.arguments.length - 1].getText(routes);
  ts.forEachChild(node, visitRoutes);
}
visitRoutes(routes);
assert.ok(bookingHandler);

async function book(options: { jobs?: any[]; ids?: string[]; count?: number; type?: string; failProvider?: boolean; failSave?: boolean } = {}) {
  const members: any[] = options.jobs || [{ ...base }];
  const changes: { id: string; patch: any }[] = [];
  let providerCalls = 0;
  let sentParcels: any[] = [];
  let response: any;
  let status = 200;
  const context: any = vm.createContext({
    console: { error() {} }, z, dpdParcelSchema, calculateShippingCost,
    crypto: { randomUUID: () => "shipment-group" },
    storage: { getJob: async (id: string) => members.find(member => member.id === id) },
    dpdService: {
      isConfigured: () => true,
      createShipment: async (input: any) => {
        providerCalls++;
        sentParcels = input.parcels;
        if (options.failProvider) throw new Error("Provider failed");
        return { trackingNumber: "TRACKING-TEST", labelHtml: "<p>Test label</p>", parcelNumbers: ["parcel"], trackingUrl: "https://example.invalid/tracking" };
      },
    },
    maybeSendDispatchNotification: async () => {},
    jobs: { id: "id" }, inArray: (_field: string, ids: string[]) => ids,
    eq: (_field: string, id: string) => id, asc: (field: string) => field,
    db: { transaction: async (fn: any) => {
      const pending: typeof changes = [];
      const tx = {
        select: () => ({ from: () => ({ where: (ids: string[]) => ({ orderBy: () => ({ for: async () => members.filter(member => ids.includes(member.id)) }) }) }) }),
        update: () => ({ set: (patch: any) => ({ where: async (id: string) => {
          pending.push({ id, patch });
          if (options.failSave) throw new Error("Database failed");
        } }) }),
      };
      const result = await fn(tx);
      changes.push(...pending);
      return result;
    } },
  });
  const script = ts.transpileModule(`${savedFunctions}\nconst handler = ${bookingHandler}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const handler = vm.runInContext(script, context);
  await handler({ body: {
    jobIds: options.ids || members.map(member => member.id),
    recipientName: "Test recipient", recipientStreet: "Test Street", recipientCity: "Test City", recipientPostcode: "TEST",
    packageCount: options.count ?? 1, packageType: options.type || "box",
  } }, {
    status(value: number) { status = value; return this; },
    json(value: any) { response = value; return this; },
  });
  return { response, status, changes, providerCalls, sentParcels };
}

test("single DPD booking persists tracking, dispatch method, normalized parcels and charge", async () => {
  const result = await book({ count: 2 });
  assert.equal(result.status, 200);
  assert.equal(result.sentParcels.length, 2);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].patch.dhlTrackingNumber, "TRACKING-TEST");
  assert.equal(result.changes[0].patch.shippingMethod, "direct_delivery");
  assert.equal(result.changes[0].patch.packageCount, 2);
  assert.equal(result.changes[0].patch.packageType, "boxes");
  assert.equal(result.changes[0].patch.shippingCost, "10");
  assert.equal(result.changes[0].patch.invoiceStatus, undefined);
});

test("multiple booked jobs share one shipment and only one carriage charge", async () => {
  const result = await book({ jobs: [{ ...base }, { ...base, id: "job2", completed: false }], count: 3 });
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].patch.shippingCost, "15");
  assert.equal(result.changes[1].patch.shippingCost, null);
  for (const change of result.changes) {
    assert.equal(change.patch.consolidatedShipmentId, "shipment-group");
    assert.equal(change.patch.shippingMethod, "consolidated");
    assert.equal(change.patch.completed, undefined);
  }
  assert.equal(result.changes[1].patch.dispatchEmailQueuedAt, undefined);
});

test("bags use bag pricing and large box shipments preserve TBA", async () => {
  assert.equal((await book({ type: "bag" })).changes[0].patch.shippingCost, "6.5");
  assert.equal((await book({ count: 5 })).changes[0].patch.shippingCost, "TBA");
});

test("already-issued invoice charges are unchanged when tracking is booked", async () => {
  const result = await book({ jobs: [{ ...base, invoiceStatus: "invoiced", shippingCost: "123", packageCount: 4 }] });
  assert.equal(result.changes[0].patch.dhlTrackingNumber, "TRACKING-TEST");
  assert.equal(result.changes[0].patch.shippingCost, undefined);
  assert.equal(result.changes[0].patch.packageCount, undefined);
  assert.equal(result.changes[0].patch.shippingMethod, undefined);
  assert.ok(result.response.warning.includes("unchanged"));
});

test("missing/cross-customer/mixed-invoice orders and invalid parcels never book a shipment", async () => {
  for (const options of [
    { ids: ["job1", "missing"] },
    { jobs: [{ ...base }, { ...base, id: "job2", customerId: "other" }] },
    { jobs: [{ ...base }, { ...base, id: "job2", invoiceStatus: "invoiced" }] },
    { count: 0 }, { count: 51 }, { type: "unknown" },
  ]) {
    const result = await book(options);
    assert.ok(result.status >= 400);
    assert.equal(result.providerCalls, 0);
    assert.equal(result.changes.length, 0);
  }
});

test("failed provider never changes orders; failed save returns booked label without inviting a duplicate booking", async () => {
  const providerFailure = await book({ failProvider: true });
  assert.equal(providerFailure.status, 500);
  assert.equal(providerFailure.changes.length, 0);
  const saveFailure = await book({ jobs: [{ ...base }, { ...base, id: "job2" }], failSave: true });
  assert.equal(saveFailure.status, 200);
  assert.equal(saveFailure.providerCalls, 1);
  assert.equal(saveFailure.changes.length, 0);
  assert.equal(saveFailure.response.trackingNumber, "TRACKING-TEST");
  assert.ok(saveFailure.response.labelHtml);
  assert.ok(saveFailure.response.warning.includes("do not book again"));
});
