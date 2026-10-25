import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { applyInvoiceQuantities, invoiceQuantitiesSchema } from "../shared/invoice-quantities";
import { billedQuantityForMatchingLine, calculateJobPrice, CODE_TO_PRINT_SIZE, MIN_ORDER_QTY } from "../shared/pricing";
import { getShippingIssues } from "../shared/shipping-details";

// Exercise the real route handler with isolated storage/Xero dependencies:
// no real invoices, payments, customer emails or database writes.
const source = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
let handlerText = "";
let mergeText = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "mergeMatchingInvoiceLines") mergeText = node.getText(source);
  if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === "/api/xero/consolidated-invoice") {
    handlerText = node.arguments[node.arguments.length - 1].getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handlerText && mergeText);

async function run(options: { failXero?: boolean; expected?: Record<string, number>; reset?: boolean; acknowledgeShipping?: boolean } = {}) {
  const quantities: Record<string, number> = options.reset ? {} : { first: 9 };
  const items = [
    { id: "first", jobId: "job", jobType: "Embroidery", quantity: 6, stitchCount: 4000 },
    { id: "second", jobId: "job", jobType: "Embroidery", quantity: 6, stitchCount: 4000 },
  ];
  const jobs = [{ id: "job", customerId: "customer", jobName: "Test order", invoiceStatus: "ready" }];
  const customer = { id: "customer", name: "Test customer", pricingTable2025: false, pricingTable2026: false };
  const updates: any[] = [];
  const cleanup: string[][] = [];
  let sentLines: any[] = [];
  let status = 200;
  let body: any;
  const context = vm.createContext({
    console: { log() {}, error() {} },
    require() { throw new Error("External integrations disabled in test"); },
    storage: {
      getJobs: async () => jobs,
      getCustomer: async () => customer,
      getJobLineItems: async () => items,
      getLogoSetups: async () => [],
      updateJob: async (_id: string, data: any) => updates.push(data),
    },
    getInvoiceQuantities: async () => ({ ...quantities }),
    clearInvoiceQuantities: async (ids: string[]) => { cleanup.push(ids); },
    applyInvoiceQuantities, invoiceQuantitiesSchema,
    getShippingIssues,
    billedQuantityForMatchingLine, calculateJobPrice, CODE_TO_PRINT_SIZE, MIN_ORDER_QTY,
    xeroService: { createConsolidatedInvoice: async (_jobs: any, _customer: any, lines: any[]) => {
      sentLines = lines;
      if (options.failXero) throw new Error("Xero unavailable");
      return { Invoices: [{ InvoiceID: "invoice", InvoiceNumber: "TEST-ONLY" }] };
    } },
  });
  const compiled = ts.transpileModule(`${mergeText}\nconst handler = ${handlerText}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const handler = vm.runInContext(compiled, context);
  await handler({ body: {
    jobIds: ["job"], customerId: "customer", manualPrices: { first: 2.3, second: 2.3 },
    acknowledgeIncompleteShipping: options.acknowledgeShipping !== false,
    ...(options.expected === undefined ? {} : { invoiceQuantities: options.expected }),
  } }, {
    status(code: number) { status = code; return this; },
    json(data: any) { body = data; return this; },
  });
  return { status, body, sentLines, updates, cleanup, items };
}

test("Xero receives the saved merged quantity and recorded invoice total matches it", async () => {
  const result = await run({ expected: { first: 9 } });
  assert.equal(result.status, 200);
  assert.equal(result.sentLines.length, 1);
  assert.equal(result.sentLines[0].quantity, 9);
  assert.ok(Math.abs(result.updates[0].invoiceTotal - 20.7) < 0.001);
  assert.equal(result.updates[0].invoiceStatus, "invoiced");
  assert.deepEqual(Array.from(result.cleanup[0]), ["first", "second"]);
  assert.equal(result.items[0].quantity, 6);
});

test("a failed Xero request retains the draft and never marks jobs invoiced", async () => {
  const result = await run({ failXero: true });
  assert.equal(result.status, 500);
  assert.equal(result.updates.length, 0);
  assert.equal(result.cleanup.length, 0);
});

test("stale previews cannot invoice quantities changed by another staff member", async () => {
  const result = await run({ expected: { first: 8 } });
  assert.equal(result.status, 409);
  assert.equal(result.sentLines.length, 0);
  assert.equal(result.cleanup.length, 0);
});

test("reset quantities fall back to the normal merged billed quantity", async () => {
  const result = await run({ reset: true, expected: {} });
  assert.equal(result.status, 200);
  assert.equal(result.sentLines[0].quantity, 12);
  assert.ok(Math.abs(result.updates[0].invoiceTotal - 27.6) < 0.001);
});

test("incomplete shipping cannot silently create an invoice or change job billing", async () => {
  const result = await run({ acknowledgeShipping: false });
  assert.equal(result.status, 409);
  assert.equal(result.sentLines.length, 0);
  assert.equal(result.updates.length, 0);
  assert.equal(result.cleanup.length, 0);
  assert.equal(result.body.shippingIssues[0].jobId, "job");
});
