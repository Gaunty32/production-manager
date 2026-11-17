import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { invoiceSelectionError } from "../shared/invoice-readiness";
import { isCustomerProvidedLabel } from "../shared/shipping-details";

const source = ts.createSourceFile("InvoicingQueue.tsx", readFileSync(new URL("../client/src/pages/InvoicingQueue.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.VariableDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleCreateInvoice") handler = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handler);
const compiled = ts.transpileModule(`const ${handler.getText(source)}; handleCreateInvoice;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

test("the real invoice handler refreshes and stops stale selections before contacting Xero", async () => {
  const staleJob = { id: "frog", customerId: "customer", jobName: "frog", jobNumber: 2373, invoiceStatus: "ready" };
  let requests = 0;
  const notices: any[] = [];
  const refreshed: unknown[] = [];
  const context = vm.createContext({
    quantitiesLoaded: true, quantityEdits: {}, savingQuantities: {},
    jobsByCustomer: { customer: [staleJob] }, selectedJobs: new Set(["frog"]),
    getCustomerApprovedLogos: () => [], getShippingIssues: () => [],
    getJobLineItems: () => [], jobs: [staleJob], manualShippingCosts: {}, manualPrices: {},
    invoiceSelectionError, isCustomerProvidedLabel, setCreatingInvoice: () => {},
    queryClient: {
      fetchQuery: async () => [{ ...staleJob, invoiceStatus: "invoiced", invoiceReference: "INV-1362" }],
      invalidateQueries: async (key: unknown) => { refreshed.push(key); },
    },
    apiRequest: async () => { requests++; throw new Error("Must not create an invoice"); },
    toast: (notice: unknown) => notices.push(notice),
    console: { error: () => {} },
  });
  await vm.runInContext(compiled, context)("customer");
  assert.equal(requests, 0, "A stale selection must never reach the invoice endpoint");
  assert.match(notices[0].description, /frog \(#2373\) is already invoiced on INV-1362/);
  assert.equal(refreshed.length, 1);
});

test("the server's readiness guard runs before creating a Xero invoice", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.post("/api/xero/consolidated-invoice"');
  const guard = routes.indexOf("invoiceSelectionError(jobIds, selectedJobs)", start);
  const create = routes.indexOf("xeroService.create", start);
  assert.ok(start >= 0 && guard > start && create > guard);
  assert.match(routes.slice(guard, guard + 250), /status\(409\)/);
});
