import assert from "node:assert/strict";
import test from "node:test";
import { applyInvoiceQuantities, invoiceQuantitySchema } from "./invoice-quantities";

test("saved quantities replace the complete merged invoice row without mutating production data", () => {
  const lines = [{ lineItemId: "first", quantity: 12, unitPrice: 2.3 }];
  const result = applyInvoiceQuantities(lines, { first: 9 });
  assert.equal(result[0].quantity, 9);
  assert.equal(result[0].unitPrice, 2.3);
  assert.equal(lines[0].quantity, 12);
});

test("unmodified, carriage and setup quantities stay unchanged", () => {
  const lines = [{ lineItemId: "first", quantity: 6 }, { quantity: 1 }];
  assert.deepEqual(applyInvoiceQuantities(lines, { unrelated: 20 }), lines);
});

test("quantities must be finite positive whole numbers", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, "10", null]) {
    assert.equal(invoiceQuantitySchema.safeParse(value).success, false);
  }
  assert.equal(invoiceQuantitySchema.parse(1), 1);
});
