import { test } from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_SHIPPING_OPTIONS, getCustomerShippingOptionLabel } from "./shipping-options";
import { customerJobSubmissionSchema } from "./schema";

const future = new Date();
future.setDate(future.getDate() + 14);
const submission = {
  jobName: "Fixture delivery order",
  requestedJobType: "Print",
  requiredDispatchDate: future.toISOString(),
  deliveryAddress: "Fixture delivery address",
};

test("local delivery appears with its exact service area and is accepted by the order schema", () => {
  const label = "Local delivery (within 15 miles of LS13)";
  assert.equal(CUSTOMER_SHIPPING_OPTIONS.find(option => option.value === "local_delivery")?.label, label);
  assert.equal(getCustomerShippingOptionLabel("local_delivery"), label);
  const parsed = customerJobSubmissionSchema.parse({ ...submission, requestedShippingMethod: "local_delivery" });
  assert.equal(parsed.requestedShippingMethod, "local_delivery");
  assert.equal(parsed.deliveryAddress, submission.deliveryAddress);
});

test("existing shipment choices and the new-order default remain supported", () => {
  for (const option of CUSTOMER_SHIPPING_OPTIONS) {
    const parsed = customerJobSubmissionSchema.parse({ ...submission, requestedShippingMethod: option.value });
    assert.equal(parsed.requestedShippingMethod, option.value);
    assert.equal(getCustomerShippingOptionLabel(option.value), option.label);
  }
  assert.equal(customerJobSubmissionSchema.parse(submission).requestedShippingMethod, "dpd");
  assert.equal(getCustomerShippingOptionLabel(null), "Not specified");
  assert.equal(customerJobSubmissionSchema.safeParse({ ...submission, requestedShippingMethod: "invalid" }).success, false);
});
