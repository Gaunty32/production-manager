import assert from "node:assert/strict";
import test from "node:test";
import { invoiceSelectionError } from "./invoice-readiness";

const jobs = [
  { id: "frog", jobName: "frog", jobNumber: 2373, invoiceStatus: "invoiced", invoiceReference: "INV-1362" },
  { id: "duck", jobName: "Duck", jobNumber: 2374, invoiceStatus: "invoiced", invoiceReference: "INV-1362" },
  { id: "script", jobName: "script", invoiceStatus: "ready" },
];

test("stale selections name already-invoiced orders and the existing invoice", () => {
  const error = invoiceSelectionError(["frog", "duck", "script"], jobs)!;
  assert.match(error, /frog \(#2373\) is already invoiced on INV-1362/);
  assert.match(error, /Duck \(#2374\) is already invoiced on INV-1362/);
  assert.doesNotMatch(error, /script is/);
  assert.match(error, /No new invoice was created/);
});

test("only currently ready orders pass, regardless of completion or shipping", () => {
  assert.equal(invoiceSelectionError(["script"], jobs), null);
  for (const invoiceStatus of ["pending", "draft", "paid", "sent"]) {
    assert.match(invoiceSelectionError(["x"], [{ id: "x", jobName: "Test", invoiceStatus }])!, /no longer ready/);
  }
});

test("missing orders block the whole selection instead of silently dropping them", () => {
  assert.match(invoiceSelectionError(["missing", "script"], jobs)!, /no longer available/);
});

test("invoiced orders without a saved reference still block retries", () => {
  assert.match(invoiceSelectionError(["x"], [{ id: "x", jobName: "Test", invoiceStatus: "invoiced" }])!, /already invoiced/);
});
