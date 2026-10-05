import { test } from "node:test";
import assert from "node:assert/strict";
import { getCustomerLogoOptions, normalizeCustomerLogoType } from "./customer-logo-options";

test("print jobs offer only repeat or correctly prepared print files", () => {
  const options = getCustomerLogoOptions("Print");
  assert.deepEqual(options.map(option => option.label), ["Repeat Logo", "Print Ready Files Supplied"]);
  assert.deepEqual(options.map(option => option.value), ["repeat_logo", "new_logo_files_supplied"]);
  assert.equal(options[1].description, "You are supplying the print ready files set to the correct colour and size.");
  assert.doesNotMatch(JSON.stringify(options), /digitis|embroidery|madeira|£12/i);
});

for (const jobType of ["Embroidery", "Mix"] as const) {
  test(`${jobType} keeps all existing embroidery logo choices`, () => {
    assert.deepEqual(getCustomerLogoOptions(jobType).map(option => option.label), [
      "Repeat Logo", "Digitising Required", "New Logo — Embroidery files & Madeira thread colours supplied",
    ]);
    for (const logoType of ["repeat_logo", "new_logo", "new_logo_files_supplied"] as const) {
      assert.equal(normalizeCustomerLogoType(jobType, logoType), logoType);
    }
  });
}

test("switching digitising to print selects print-ready files and never requests setup", () => {
  assert.equal(normalizeCustomerLogoType("Print", "new_logo"), "new_logo_files_supplied");
  assert.equal(normalizeCustomerLogoType("Print", "repeat_logo"), "repeat_logo");
  assert.equal(normalizeCustomerLogoType("Print", "new_logo_files_supplied"), "new_logo_files_supplied");
});
