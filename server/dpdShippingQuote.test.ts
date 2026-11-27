import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import {
  calculateDpdShippingQuote, dpdQuoteInputSchema, inspectDpdPostcode,
  type DpdQuoteInput,
} from "../shared/dpd-shipping-quote";
import { getDispatchIssues, isCustomerProvidedLabel } from "../shared/shipping-details";

const input: DpdQuoteInput = {
  postcode: "LS13 3HE", region: "uk", service: "next_day", packageType: "boxes", packageCount: 5,
  totalWeightKg: 37, dispatchDate: "2026-11-11", carriagePerParcel: 0.22, extraCharges: 0,
  congestion: false, confirmedTariff: true,
};
const line = (quote: ReturnType<typeof calculateDpdShippingQuote>, label: string) =>
  quote.breakdown.find(row => row.label === label)?.amount;

test("invoice examples reproduce weight-based base carriage, not a per-box tariff", () => {
  assert.equal(line(calculateDpdShippingQuote(input), "Base carriage"), 8.38);
  const ni = calculateDpdShippingQuote({
    ...input, postcode: "BT1 1AA", region: "northern_ireland", service: "two_day",
    packageCount: 10, totalWeightKg: 104, dispatchDate: "2026-11-19",
  });
  assert.equal(line(ni, "Base carriage"), 145.30);
  assert.equal(line(ni, "NI clearance"), 0.50);
  assert.equal(line(ni, "Peak surcharge"), 3);
});

test("twenty percent is added to the estimated cost once, before VAT", () => {
  const quote = calculateDpdShippingQuote(input);
  assert.equal(quote.estimatedDpdCost, 12.32);
  assert.equal(quote.markupPercent, 20);
  assert.equal(quote.markupAmount, 2.46);
  assert.equal(quote.customerCharge, 14.78);
  assert.equal(quote.breakdown.reduce((sum, row) => Math.round((sum + row.amount) * 100) / 100, 0), quote.estimatedDpdCost);
  assert.deepEqual(calculateDpdShippingQuote(quote.input), quote, "Recalculation must never mark up the previous selling price");
});

test("one to four box selling prices and bag pricing are unchanged", () => {
  for (const [count, price] of [[1, 7.50], [2, 10], [3, 15], [4, 20]]) {
    const quote = calculateDpdShippingQuote({ ...input, packageCount: count, totalWeightKg: 10 });
    assert.equal(quote.customerCharge, price);
    assert.equal(quote.markupPercent, 0);
    assert.equal(quote.markupAmount, 0);
  }
  const bag = calculateDpdShippingQuote({ ...input, packageType: "bags", packageCount: 1, totalWeightKg: 2 });
  assert.equal(bag.customerCharge, 6.50);
  assert.equal(line(bag, "Base carriage"), 4.50);
  assert.equal(line(calculateDpdShippingQuote({ ...bag.input, totalWeightKg: 1 }), "Base carriage"), 4.25);
});

test("peak charges use dispatch date, including both date boundaries", () => {
  for (const [date, charge] of [["2026-11-15", 0], ["2026-11-16", 1.5], ["2026-12-31", 1.5], ["2027-01-01", 0]] as const) {
    const quote = calculateDpdShippingQuote({ ...input, dispatchDate: date });
    assert.equal(line(quote, "Peak surcharge"), charge);
    if (date.startsWith("2027")) assert.ok(quote.warnings.some(w => w.includes("reconfirming")));
  }
});

test("postcode matching is district-specific and does not reuse generic zone surcharges", () => {
  assert.equal(inspectDpdPostcode(" bt11aa ").region, "northern_ireland");
  assert.equal(inspectDpdPostcode("PO30 1AA").region, "isle_of_wight");
  assert.equal(inspectDpdPostcode("PO3 1AA").region, "uk");
  assert.equal(inspectDpdPostcode("TR21 0AA").region, "scilly");
  assert.equal(inspectDpdPostcode("IM1 1AA").region, "isle_of_man");
  for (const postcode of ["AB32 1AA", "AB39 1AA", "PH1 1AA", "KA2 1AA"]) assert.equal(inspectDpdPostcode(postcode).region, "uk");
  for (const postcode of ["IV1 1AA", "PH15 1AA", "PA20 1AA", "KA27 1AA", "KW15 1AA"]) {
    const check = inspectDpdPostcode(postcode);
    assert.equal(check.valid, true);
    assert.equal(check.region, null, "Transit guide cannot prove pricing region");
    assert.match(check.warning || "", /£0/);
  }
  assert.equal(inspectDpdPostcode("nonsense").valid, false);
});

test("offshore tariffs, service restrictions, weights and explicit confirmations are validated", () => {
  assert.throws(() => calculateDpdShippingQuote({ ...input, postcode: "BT1 1AA" }), /tariff does not match/);
  assert.throws(() => calculateDpdShippingQuote({ ...input, postcode: "IM1 1AA", region: "isle_of_man" }), /not quoted/);
  assert.throws(() => calculateDpdShippingQuote({ ...input, totalWeightKg: 151 }), /30kg/);
  for (const overrides of [
    { packageCount: 0 }, { packageCount: 51 }, { totalWeightKg: 0 }, { totalWeightKg: NaN },
    { carriagePerParcel: -1 }, { confirmedTariff: false }, { dispatchDate: "2026-02-30" },
  ]) assert.equal(dpdQuoteInputSchema.safeParse({ ...input, ...overrides }).success, false);
  assert.throws(() => calculateDpdShippingQuote({ ...input, dispatchDate: "2026-03-08" }), /9 March/);
  assert.equal(calculateDpdShippingQuote({ ...input, totalWeightKg: 37.1 }).billableWeightKg, 38);
});

test("known additional fees are explicit, and every quote discloses uncertainty", () => {
  const quote = calculateDpdShippingQuote({ ...input, congestion: true, extraCharges: 7.25 });
  assert.equal(line(quote, "Congestion (if confirmed)"), 0.95);
  assert.equal(line(quote, "Other charges entered"), 7.25);
  assert.ok(quote.warnings.some(w => w.includes("not a verified DPD rate")));
  assert.ok(quote.warnings.some(w => w.includes("Estimate only")));
  assert.ok(quote.warnings.some(w => w.includes("Fuel is conservatively")));
  assert.equal(line(calculateDpdShippingQuote(input), "Congestion (if confirmed)"), 0);
});

const source = ts.createSourceFile("dpdShippingQuote.ts",
  readFileSync(new URL("./dpdShippingQuote.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const declarations = source.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(source).replace(/^export /, "")).join("\n");
const base: any = {
  id: "primary", customerId: "customer", jobName: "Quote test", invoiceStatus: "ready",
  shippingMethod: "consolidated", dhlTrackingNumber: "TEST-TRACKING", consolidatedShipmentId: "shipment",
  shippingCost: "TBA", packageCount: 5, packageType: "boxes", shippingCarrier: "dpd", completed: true,
};

function quoteTestContext(members: any[] = [base], options: { role?: string; stocking?: boolean; failSave?: boolean } = {}) {
  const pending: any[] = [];
  const changes: any[] = [];
  const routes: Record<string, any> = {};
  const ctx = vm.createContext({
    z, calculateDpdShippingQuote, dpdQuoteInputSchema, isCustomerProvidedLabel, getDispatchIssues,
    queueOrderPostcodeWarning: async () => {},
    canViewPrices: (role: string) => ["admin", "demo"].includes(role),
    jobs: { id: "id", customerId: "customerId" }, stockingOrders: { jobId: "jobId" },
    eq: (_field: any, id: any) => id, asc: (field: any) => field,
    storage: { getUser: async () => ({ id: "approver", role: options.role || "admin" }), getJob: async () => members.find(j => j.id === "primary") },
    db: {
      select: () => ({ from: () => ({ where: async () => options.stocking ? [{}] : [] }) }),
      transaction: async (run: any) => {
        const tx = {
          select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ for: async () => members }) }) }) }),
          update: () => ({ set: (updates: any) => ({ where: async (id: string) => {
            pending.push({ id, updates });
            if (options.failSave) throw new Error("Save failed");
          } }) }),
        };
        const result = await run(tx);
        changes.push(...pending);
        return result;
      },
    },
  });
  const api = vm.runInContext(ts.transpileModule(`${declarations}
    ({ prepareDpdQuoteApproval, stripInternalShippingQuote, registerDpdShippingQuoteRoutes })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, ctx);
  api.registerDpdShippingQuoteRoutes({ use() {}, post(path: string, _auth: any, handler: any) { routes[path] = handler; } }, () => {});
  async function approve(body: any = { input, approved: true, confirmedDpd: true }) {
    let status = 200; let response: any;
    await routes["/api/jobs/:id/dpd-shipping-quote"]({ params: { id: "primary" }, session: { userId: "approver" }, body }, {
      status(code: number) { status = code; return this; }, json(value: any) { response = value; return this; },
    });
    return { status, response, changes };
  }
  return { ...api, approve, changes };
}

test("approval recomputes on the server and saves one charge plus an approved snapshot", async () => {
  const ctx = quoteTestContext([base, { ...base, id: "secondary", shippingCost: null }]);
  const result = await ctx.approve({ input, approved: true, confirmedDpd: true, customerCharge: 999 });
  assert.equal(result.status, 200);
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].updates.shippingCost, "14.78");
  assert.equal(result.changes[0].updates.consignmentWeightKg, 37);
  assert.equal(result.changes[1].updates.consignmentWeightKg, 37);
  assert.equal(result.changes[1].updates.shippingCost, null);
  assert.equal(result.changes[1].updates.shippingQuote, null);
  assert.ok(result.changes[0].updates.shippingQuote.approvedAt);
  assert.equal(result.changes[0].updates.shippingQuote.approvedBy, "approver");
  assert.equal(result.changes[0].updates.dhlTrackingNumber, undefined);
  assert.equal(result.changes[0].updates.dispatchEmailQueuedAt, undefined);
  assert.equal(result.changes[0].updates.completed, undefined);
});

test("approval rejects issued invoices, other carriers, labels, stale counts and charge-owner mistakes before writing", async () => {
  const scenarios = [
    [{ ...base, invoiceStatus: "invoiced" }],
    [base, { ...base, id: "secondary", shippingCost: null, invoiceStatus: "paid" }],
    [{ ...base, shippingCarrier: "inpost" }],
    [{ ...base, requestedShippingMethod: "courier_label_provided" }],
    [{ ...base, packageCount: 6 }],
    [{ ...base, dhlTrackingNumber: null }],
    [{ ...base, shippingMethod: "customer_collection" }],
    [{ ...base, shippingCost: null }, { ...base, id: "secondary", shippingCost: "TBA" }],
    [base, { ...base, id: "secondary", shippingCost: null, packageCount: 4 }],
    [base, { ...base, id: "secondary", shippingCost: "10" }],
  ];
  for (const members of scenarios) {
    const result = await quoteTestContext(members).approve();
    assert.equal(result.status, 400);
    assert.equal(result.changes.length, 0);
  }
});

test("approval requires a pricing role, explicit consent, valid surcharge input and non-Abode shipment", async () => {
  for (const role of ["staff", "demo"]) assert.equal((await quoteTestContext([base], { role }).approve()).status, 403);
  assert.equal((await quoteTestContext([base], { stocking: true }).approve()).status, 409);
  for (const body of [
    { input, approved: false, confirmedDpd: true }, { input, approved: true },
    { input: { ...input, carriagePerParcel: -1 }, approved: true, confirmedDpd: true },
    { input: { ...input, packageCount: 4 }, approved: true, confirmedDpd: true },
  ]) {
    const result = await quoteTestContext().approve(body);
    assert.equal(result.status, 400);
    assert.equal(result.changes.length, 0);
  }
});

test("failed atomic save does not leave any committed member changes", async () => {
  const result = await quoteTestContext([base, { ...base, id: "secondary", shippingCost: null }], { failSave: true }).approve();
  assert.equal(result.status, 400);
  assert.equal(result.changes.length, 0);
});

test("approving carriage releases only completed held jobs without completing unfinished siblings", async () => {
  const result = await quoteTestContext([
    { ...base, invoiceStatus: "pending" },
    { ...base, id: "secondary", shippingCost: null, completed: false, invoiceStatus: "pending" },
  ]).approve();
  assert.equal(result.changes[0].updates.invoiceStatus, "ready");
  assert.equal(result.changes[1].updates.invoiceStatus, undefined);
  assert.equal(result.changes[1].updates.completed, undefined);
});

test("customer responses remove internal courier estimates and approval identity at any nesting depth", () => {
  const ctx = quoteTestContext();
  const clean = ctx.stripInternalShippingQuote({
    job: { shippingCost: "14.78", shippingQuote: { estimatedDpdCost: 12.32, markupPercent: 20 } },
    list: [{ shippingQuote: { approvedBy: "private" }, id: "primary" }],
  });
  assert.equal(clean.job.shippingCost, "14.78");
  assert.equal("shippingQuote" in clean.job, false);
  assert.equal("shippingQuote" in clean.list[0], false);
});
