import test from "node:test";
import assert from "node:assert/strict";
import { getRequestedJobTypeLabel } from "./requested-job-type";

test("shows the customer's requested job type without abbreviating mixed work", () => {
  assert.equal(getRequestedJobTypeLabel("Embroidery"), "Embroidery");
  assert.equal(getRequestedJobTypeLabel("Print"), "Print");
  assert.equal(getRequestedJobTypeLabel("Mix"), "Print & Embroidery");
});

test("legacy and unknown requests are explicitly unspecified, not assumed embroidery or print", () => {
  for (const value of [undefined, null, "", "unknown", "DST", "PDF"]) {
    assert.equal(getRequestedJobTypeLabel(value), "Job type not specified");
  }
});
