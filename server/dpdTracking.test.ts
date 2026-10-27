import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getDpdTrackingUrl } from "../shared/dpd-tracking";

const account = "Test account, AB1 2CD";
const tracking = "TEST-TRACKING";

test("custom deliveries use the recipient postcode, not the account postcode", () => {
  const url = new URL(getDpdTrackingUrl({
    dhlTrackingNumber: tracking, deliveryAddressType: "custom", deliveryAddress: "Test recipient\nWD18 9DA\n",
  }, account));
  assert.equal(url.searchParams.get("postcode"), "WD18 9DA");
  assert.equal(url.searchParams.get("reference"), tracking);
});

test("account deliveries use the account address, ignoring an unused custom address", () => {
  const url = new URL(getDpdTrackingUrl({
    dhlTrackingNumber: tracking, deliveryAddressType: "customer", deliveryAddress: "Unused address WD18 9DA",
  }, account));
  assert.equal(url.searchParams.get("postcode"), "AB1 2CD");
});

test("legacy orders without an address type still respect their delivery address", () => {
  const url = new URL(getDpdTrackingUrl({
    dhlTrackingNumber: tracking, deliveryAddress: "Test recipient wd18 9da",
  }, account));
  assert.equal(url.searchParams.get("postcode"), "WD18 9DA");
});

test("missing custom postcodes never silently fall back to the wrong account postcode", () => {
  for (const address of [null, "", "Test recipient, no postcode recorded"]) {
    const url = new URL(getDpdTrackingUrl({
      dhlTrackingNumber: tracking, deliveryAddressType: "custom", deliveryAddress: address,
    }, account));
    assert.equal(url.searchParams.has("postcode"), false);
  }
});

test("legacy account deliveries and absent addresses keep tracking available", () => {
  assert.equal(new URL(getDpdTrackingUrl({ dhlTrackingNumber: tracking }, account)).searchParams.get("postcode"), "AB1 2CD");
  assert.equal(new URL(getDpdTrackingUrl({ dhlTrackingNumber: tracking })).searchParams.has("postcode"), false);
});

test("references are trimmed and encoded without changing the stored number", () => {
  const job = { dhlTrackingNumber: " TEST & REF " };
  const url = new URL(getDpdTrackingUrl(job));
  assert.equal(url.searchParams.get("reference"), "TEST & REF");
  assert.equal(job.dhlTrackingNumber, " TEST & REF ");
});

test("all three customer portal tracking links use the order-aware helper", () => {
  const source = readFileSync(new URL("../client/src/pages/CustomerDashboard.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/href=\{getDpdTrackingUrl\(job, customerUser\?\.customerAddress\)\}/g) || []).length, 3);
  assert.equal(source.includes("customerPostcode"), false);
});
