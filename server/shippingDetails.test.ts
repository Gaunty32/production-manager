import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { calculateShippingCost } from "../shared/pricing";
import { dpdParcelSchema, getShippingIssues, getDispatchIssues, isCustomerProvidedLabel, customerLabelShippingUpdates } from "../shared/shipping-details";
import { updateJobSchema } from "../shared/schema";
import { dpdJobReference, dpdJobReferences } from "../shared/dpd-references";

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

test("only a verified saved InPost label makes its missing tracking optional", () => {
  const inpost = {
    ...base, shippingMethod: "direct_delivery", packageCount: 1, packageType: "bags",
    shippingCost: "5.50", shippingCarrier: "inpost", confirmedExternalShippingLabel: true,
  };
  assert.deepEqual(getShippingIssues([inpost]), []);
  assert.match(getShippingIssues([{ ...inpost, confirmedExternalShippingLabel: false }])[0].reasons.join(" "), /No tracking/);
  assert.match(getShippingIssues([{ ...inpost, shippingCarrier: "dpd" }])[0].reasons.join(" "), /No tracking/);
  assert.match(getShippingIssues([{ ...inpost, shippingCost: null }])[0].reasons.join(" "), /Carriage/);
  assert.match(getShippingIssues([{ ...inpost, packageCount: null }])[0].reasons.join(" "), /Parcel/);
});

test("supplied labels override automatic tariffs but preserve tracking and parcel information", () => {
  const job = { ...base, requestedShippingMethod: "courier_label_provided" };
  const updates = customerLabelShippingUpdates(job, {
    shippingMethod: "direct_delivery", shippingCost: "7.5",
    dhlTrackingNumber: "CUSTOMER-TRACKING", packageType: "boxes", packageCount: 1,
  });
  assert.equal(updates.shippingCost, "0");
  assert.equal(updates.shippingMethod, "courier_label_provided");
  assert.equal(updates.dhlTrackingNumber, "CUSTOMER-TRACKING");
  assert.equal(updates.packageCount, 1);
  assert.equal(updates.consolidatedShipmentId, null);
  assert.equal(getShippingIssues([job]).length, 0, "Customer label tracking and parcel details are optional");
  assert.equal(customerLabelShippingUpdates(base, { shippingMethod: "courier_label_provided", shippingCost: "99" }).shippingCost, "0");
  assert.equal(customerLabelShippingUpdates(base, { shippingMethod: "direct_delivery", shippingCost: "7.5" }).shippingCost, "7.5");
});

test("the staff completion form accepts supplied labels without tracking or parcel details", () => {
  const formSource = ts.createSourceFile("ShippingInfoDialog.tsx",
    readFileSync(new URL("../client/src/components/ShippingInfoDialog.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let schemaText = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(formSource) === "shippingSchema") schemaText = node.getText(formSource);
    ts.forEachChild(node, visit);
  }
  visit(formSource);
  assert.ok(schemaText);
  const schema = vm.runInNewContext(ts.transpileModule(`const ${schemaText}; shippingSchema;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, { z });
  assert.equal(schema.safeParse({ shippingMethod: "courier_label_provided" }).success, true);
  assert.equal(schema.safeParse({ shippingMethod: "direct_delivery" }).success, false);
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
let patchHandler = "";
function visitRoutes(node: ts.Node) {
  if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === "/api/dpd/book-shipment") bookingHandler = node.arguments[node.arguments.length - 1].getText(routes);
  if (ts.isCallExpression(node) && node.expression.getText(routes) === "app.patch"
    && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === "/api/jobs/:id") patchHandler = node.arguments[node.arguments.length - 1].getText(routes);
  ts.forEachChild(node, visitRoutes);
}
visitRoutes(routes);
assert.ok(bookingHandler);
assert.ok(patchHandler);

async function patchShipping(job: any, body: any) {
  const changes: any[] = [];
  let status = 200;
  const context = vm.createContext({
    z, updateJobSchema, calculateShippingCost, isCustomerProvidedLabel, customerLabelShippingUpdates, getShippingIssues, getDispatchIssues,
    console: { error() {} },
    stockingOrders: { jobId: "jobId" }, eq: () => true,
    db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
    storage: {
      getJob: async () => job,
      getJobs: async () => [job],
      updateJob: async (_id: string, updates: any) => { changes.push(updates); return { ...job, ...updates }; },
    },
    maybeSendDispatchNotification: async () => {},
  });
  const handler = vm.runInContext(ts.transpileModule(`const handler = ${patchHandler}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  await handler({ params: { id: job.id }, body }, {
    status(code: number) { status = code; return this; }, json() {},
  });
  return { status, changes };
}

test("the job endpoint refuses invoice readiness without shipping, before writing", async () => {
  const result = await patchShipping({ ...base, completed: false, invoiceStatus: "pending" }, {
    completed: true, invoiceStatus: "ready",
  });
  assert.equal(result.status, 400);
  assert.equal(result.changes.length, 0);
});

test("hold completes production but keeps an unshipped job out of invoicing", async () => {
  const result = await patchShipping({ ...base, completed: false, invoiceStatus: "pending" }, {
    completed: true, invoiceStatus: "pending",
  });
  assert.equal(result.status, 200);
  assert.equal(result.changes[0].completed, true);
  assert.equal(result.changes[0].invoiceStatus, "pending");
});

test("four recorded boxes persist with carriage before moving to invoicing", async () => {
  const result = await patchShipping({ ...base, invoiceStatus: "pending" }, {
    completed: true, invoiceStatus: "ready", shippingMethod: "direct_delivery",
    dhlTrackingNumber: "TRACKING-4-BOXES", packageCount: 4, packageType: "boxes",
  });
  assert.equal(result.status, 200);
  assert.equal(result.changes[0].packageCount, 4);
  assert.equal(result.changes[0].shippingCost, String(calculateShippingCost("boxes", 4).cost));
  assert.equal(result.changes[0].invoiceStatus, "ready");
});

test("ready jobs cannot have their saved shipping erased", async () => {
  const result = await patchShipping({
    ...base, shippingMethod: "direct_delivery", dhlTrackingNumber: "TRACKING",
    packageCount: 4, packageType: "boxes", shippingCost: "20",
  }, { shippingMethod: null, dhlTrackingNumber: null, packageCount: null, packageType: null });
  assert.equal(result.status, 400);
  assert.equal(result.changes.length, 0);
});

test("collection can enter invoicing without courier tracking or parcels", async () => {
  const result = await patchShipping({ ...base, invoiceStatus: "pending" }, {
    completed: true, invoiceStatus: "ready", shippingMethod: "customer_collection",
  });
  assert.equal(result.status, 200);
});

test("last-line completion keeps missing shipping pending and admits complete shipping", async () => {
  const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = source.indexOf('const shippingIssues = getDispatchIssues([job], await storage.getJobs());');
  assert.ok(start > 0);
  const end = source.indexOf('// Push the job', start);
  const branch = source.slice(start, end);
  for (const shipping of [
    {},
    { shippingMethod: "direct_delivery", dhlTrackingNumber: "TRACKING", packageCount: 4, packageType: "boxes", shippingCost: "20" },
    { shippingMethod: "customer_collection" },
  ]) {
    const job = { ...base, invoiceStatus: "pending", ...shipping };
    const changes: any[] = [];
    const script = ts.transpileModule(`(async () => { ${branch} })()`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    await vm.runInNewContext(script, {
      job, lineItem: { jobId: job.id }, getDispatchIssues, Date,
      storage: { getJobs: async () => [job], updateJob: async (_id: string, data: any) => changes.push(data) },
    });
    assert.equal(changes[0].completed, true);
    assert.equal(changes[0].invoiceStatus, shipping.shippingMethod ? "ready" : "pending");
    assert.equal(changes[0].conversationArchivedByStaff, shipping.shippingMethod ? true : undefined);
  }
});

test("a shared shipment can be dispatch-ready while carriage still needs selecting for invoicing", () => {
  const secondary = {
    ...base, shippingMethod: "consolidated", consolidatedShipmentId: "shared",
    dhlTrackingNumber: "TRACKING", packageCount: 4, packageType: "boxes",
  };
  const primary = { ...secondary, id: "primary", shippingCost: "20" };
  assert.equal(getDispatchIssues([secondary], [secondary, primary]).length, 0);
  assert.equal(getShippingIssues([secondary], [secondary, primary]).length, 1);
  assert.ok(getDispatchIssues([secondary], [secondary, { ...primary, customerId: "someone-else" }]).length);
});

test("the real shipping-save endpoint zeros supplied-label carriage before saving", async () => {
  const result = await patchShipping({ ...base, requestedShippingMethod: "courier_label_provided" }, {
    shippingMethod: "direct_delivery", packageCount: 1, packageType: "boxes",
    shippingCost: "7.5", dhlTrackingNumber: "CUSTOMER-TRACKING", completed: true,
  });
  assert.equal(result.status, 200);
  assert.equal(result.changes[0].shippingCost, "0");
  assert.equal(result.changes[0].shippingMethod, "courier_label_provided");
  assert.equal(result.changes[0].dhlTrackingNumber, "CUSTOMER-TRACKING");
});

test("unrelated edits leave issued supplied-label invoice charges unchanged", async () => {
  const job = { ...base, requestedShippingMethod: "courier_label_provided", invoiceStatus: "invoiced", shippingCost: "7.5" };
  const result = await patchShipping(job, { notes: "New note" });
  assert.equal(result.status, 200);
  assert.equal(result.changes[0].shippingCost, undefined);
  assert.equal(result.changes[0].shippingMethod, undefined);
  const rejected = await patchShipping(job, { shippingCost: "0" });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.changes.length, 0);
});

async function book(options: { jobs?: any[]; ids?: string[]; count?: number; type?: string; reference?: string; failProvider?: boolean; failSave?: boolean; stocking?: boolean } = {}) {
  const members: any[] = options.jobs || [{ ...base }];
  const changes: { id: string; patch: any }[] = [];
  let providerCalls = 0;
  let sentParcels: any[] = [];
  let sentReference = "";
  let additionalReferences: string[] = [];
  let response: any;
  let status = 200;
  const context: any = vm.createContext({
    console: { error() {} }, z, dpdParcelSchema, calculateShippingCost, isCustomerProvidedLabel, dpdJobReferences,
    crypto: { randomUUID: () => "shipment-group" },
    storage: { getJob: async (id: string) => members.find(member => member.id === id) },
    dpdService: {
      isConfigured: () => true,
      createShipment: async (input: any) => {
        providerCalls++;
        sentParcels = input.parcels;
        sentReference = input.reference;
        additionalReferences = input.additionalReferences;
        if (options.failProvider) throw new Error("Provider failed");
        return { trackingNumber: "TRACKING-TEST", labelHtml: "<p>Test label</p>", parcelNumbers: ["parcel"], trackingUrl: "https://example.invalid/tracking" };
      },
    },
    maybeSendDispatchNotification: async () => {},
    jobs: { id: "id" }, stockingOrders: { jobId: "jobId" }, inArray: (_field: string, ids: string[]) => ids,
    eq: (_field: string, id: string) => id, asc: (field: string) => field,
    db: {
      select: () => ({ from: () => ({ where: async () => options.stocking ? [{ jobId: base.id }] : [] }) }),
      transaction: async (fn: any) => {
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
    reference: options.reference,
  } }, {
    status(value: number) { status = value; return this; },
    json(value: any) { response = value; return this; },
  });
  return { response, status, changes, providerCalls, sentParcels, sentReference, additionalReferences };
}

test("DPD references prioritise the job number and name over the customer or a stale client reference", async () => {
  const job = { ...base, jobNumber: 2427, jobName: "Morningside rural beanies" };
  const result = await book({ jobs: [job], reference: "The Logo Farm" });
  assert.equal(result.status, 200);
  assert.equal(result.sentReference, "#2427 Morningside rural b");
  assert.equal(result.sentReference, dpdJobReference(job));
  assert.deepEqual(Array.from(result.additionalReferences), []);
});

test("consolidated DPD bookings pass additional job references within the courier limits", async () => {
  const members = [
    { ...base, jobNumber: 2412, jobName: "Fearn Farm (FF logo)" },
    { ...base, id: "job2", jobNumber: 2413, jobName: "Valais Blacknose Society caps" },
  ];
  const result = await book({ jobs: members });
  assert.equal(result.sentReference, dpdJobReference(members[0]));
  assert.deepEqual(Array.from(result.additionalReferences), [dpdJobReference(members[1])]);
  const many = dpdJobReferences([...members, ...members.map((job, i) => ({ ...job, jobNumber: 2500 + i }))]);
  assert.equal(many.length, 3);
  assert.equal(many[2], "#2500+#2501");
  assert.ok(many.every(reference => reference.length <= 25));
});

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

test("booking a held completed job releases it to invoicing only with a confirmed carriage price", async () => {
  const held = { ...base, completed: true, invoiceStatus: "pending" };
  const booked = await book({ jobs: [held], count: 4 });
  assert.equal(booked.status, 200);
  assert.equal(booked.changes[0].patch.packageCount, 4);
  assert.equal(booked.changes[0].patch.invoiceStatus, "ready");
  assert.equal(booked.changes[0].patch.conversationArchivedByStaff, true);
  const needsPrice = await book({ jobs: [held], count: 5 });
  assert.equal(needsPrice.changes[0].patch.shippingCost, "TBA");
  assert.equal(needsPrice.changes[0].patch.invoiceStatus, undefined);
});

test("Abode bookings cannot bypass the customer-specific bag and carriage workflow", async () => {
  const result = await book({ stocking: true });
  assert.equal(result.status, 409);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.changes.length, 0);
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

test("supplied labels cannot accidentally purchase another courier label", async () => {
  for (const field of ["requestedShippingMethod", "shippingMethod"]) {
    const result = await book({ jobs: [{ ...base, [field]: "courier_label_provided" }] });
    assert.equal(result.status, 409);
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
