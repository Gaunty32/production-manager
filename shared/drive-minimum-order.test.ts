import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateJobPrice } from "./pricing";
import { getMinimumOrderComparison, isMinimumOrderDifference } from "./drive-minimum-order";

const now = new Date("2026-10-09T12:00:00Z");
const line = { quantity: 5, stitchCount: 25000, jobType: "Embroidery" };
function comparisonFor(lines = [line], date = now) {
  const price = calculateJobPrice(lines, "2026", date);
  return getMinimumOrderComparison(lines, "2026", price.totalPrice, date);
}

test("five actual items billed at six are explained only when Drive quantity and amount agree", () => {
  const comparison = comparisonFor()!;
  assert.equal(comparison.actualQuantity, 5);
  assert.equal(comparison.billedQuantity, 6);
  assert.equal(isMinimumOrderDifference(comparison, [{ quantity: "5" }], comparison.billedTotal, comparison.actualTotal), true);
  assert.equal(isMinimumOrderDifference(comparison, [{ quantity: "4" }], comparison.billedTotal, comparison.actualTotal), false);
  assert.equal(isMinimumOrderDifference(comparison, [{ quantity: "5" }], comparison.billedTotal, comparison.actualTotal + 1), false);
  assert.equal(isMinimumOrderDifference(comparison, [{ quantity: "5" }], comparison.billedTotal + 1, comparison.actualTotal), false);
});

test("same-logo split lines apply the minimum once, not separately to every line", () => {
  const comparison = comparisonFor([{ ...line, quantity: 2 }, { ...line, quantity: 3 }])!;
  assert.equal(comparison.actualQuantity, 5);
  assert.equal(comparison.billedQuantity, 6);
  assert.equal(isMinimumOrderDifference(comparison, [{ quantity: "2" }, { quantity: "3" }], comparison.billedTotal, comparison.actualTotal), true);
  assert.equal(comparisonFor([{ ...line, quantity: 3 }, { ...line, quantity: 3 }]), null);
});

test("six or more actual items and pre-policy jobs have no minimum explanation", () => {
  assert.equal(comparisonFor([{ ...line, quantity: 6 }]), null);
  assert.equal(comparisonFor([{ ...line, quantity: 10 }]), null);
  assert.equal(comparisonFor([line], new Date("2026-08-20T12:00:00Z")), null);
});

test("initials, names and bagging remain exempt", () => {
  for (const jobType of ["Embroidery Initials/Name", "Print Initials/Name", "Bagging"]) {
    assert.equal(comparisonFor([{ ...line, jobType }]), null);
  }
});

test("print and multiple distinct logos use the existing grouped invoice pricing", () => {
  const print = comparisonFor([{ quantity: 2, stitchCount: 3, jobType: "Print" }])!;
  assert.equal(print.billedQuantity, 6);
  const multiple = comparisonFor([{ ...line, quantity: 2 }, { ...line, quantity: 3, stitchCount: 5000 }])!;
  assert.equal(multiple.actualQuantity, 5);
  assert.equal(multiple.billedQuantity, 12);
  assert.equal(isMinimumOrderDifference(multiple, [{ quantity: "2" }, { quantity: "3" }], multiple.billedTotal, multiple.actualTotal), true);
});

test("unknown prices, POA, edited totals and malformed Drive quantities are not excused", () => {
  assert.equal(getMinimumOrderComparison([line], "2026", "POA", now), null);
  assert.equal(getMinimumOrderComparison([line], "2026", null, now), null);
  assert.equal(getMinimumOrderComparison([line], "2026", 1234, now), null);
  assert.equal(comparisonFor([{ ...line, stitchCount: 999999 }]), null);
  const comparison = comparisonFor()!;
  for (const quantity of ["", "5 items", "0", "2.5", "-5"]) {
    assert.equal(isMinimumOrderDifference(comparison, [{ quantity }], comparison.billedTotal, comparison.actualTotal), false);
  }
});
