import assert from "node:assert/strict";
import { test } from "node:test";
import { MEROX_DISPATCH_CUSTOMER_ID } from "../shared/dispatch-confirmation";
import { buildEmailDispatchConfirmations, renderEmailDispatchConfirmations } from "./dispatchConfirmationEmail";
import { verifyDispatchToken } from "./dispatchConfirmationTokens";

const secret = "test-only-email-secret";
const job = {
  id: "10000000-0000-4000-8000-000000000001",
  customerId: MEROX_DISPATCH_CUSTOMER_ID,
  completed: true,
  status: "completed",
  shippingMethod: "direct_delivery",
  dhlTrackingNumber: "TEST-TRACKING",
  poNumber: "MEROX-PO-123",
  jobNumber: 123,
};

test("email links use the same public, signed confirmation as the portal", () => {
  const [link] = buildEmailDispatchConfirmations([job], "https://example.com", secret);
  assert.equal(link.reference, job.poNumber);
  const url = new URL(link.url);
  assert.equal(url.origin, "https://example.com");
  assert.ok(url.pathname.startsWith("/delivery-update/"));
  const token = url.pathname.split("/").pop()!;
  assert.equal(verifyDispatchToken(token, secret)?.jobId, job.id);
  assert.equal(verifyDispatchToken(token, secret)?.customerId, MEROX_DISPATCH_CUSTOMER_ID);
  assert.ok(!link.url.includes(job.dhlTrackingNumber));
  assert.equal(verifyDispatchToken(token, secret, Date.now() + 91 * 86400000), null);
});

test("consolidated emails include one confirmation per eligible order", () => {
  const second = { ...job, id: "20000000-0000-4000-8000-000000000002", poNumber: "MEROX-PO-456" };
  const links = buildEmailDispatchConfirmations([job, second], "https://example.com", secret);
  assert.deepEqual(links.map(link => link.reference), ["MEROX-PO-123", "MEROX-PO-456"]);
  assert.notEqual(links[0].url, links[1].url);
  assert.equal(buildEmailDispatchConfirmations([{ ...job, poNumber: " " }], "https://example.com", secret)[0].reference, "Order 123");
});

test("retry links stay identical using the shipment queue timestamp", () => {
  const dispatchEmailQueuedAt = new Date("2026-11-11T12:00:00Z");
  const shipment = [job, {
    ...job, id: "20000000-0000-4000-8000-000000000002", dispatchEmailQueuedAt,
  }];
  const links = buildEmailDispatchConfirmations(shipment, "https://example.com", secret);
  assert.deepEqual(links, buildEmailDispatchConfirmations(shipment, "https://example.com", secret));
  for (const link of links) {
    const token = new URL(link.url).pathname.split("/").pop()!;
    const payload = verifyDispatchToken(token, secret, dispatchEmailQueuedAt.getTime())!;
    assert.equal(payload.expires, dispatchEmailQueuedAt.getTime() / 1000 + 90 * 86400);
  }
});

test("other customers and ineligible orders get no share section", () => {
  for (const patch of [
    { customerId: "other" }, { completed: false }, { status: "cancelled" },
    { shippingCarrier: "royal_mail" }, { dhlTrackingNumber: null }, { shippingMethod: "Collection" },
  ]) {
    const links = buildEmailDispatchConfirmations([{ ...job, ...patch }], "https://example.com", "");
    assert.deepEqual(links, []);
    assert.equal(renderEmailDispatchConfirmations(links), "");
  }
  assert.equal(renderEmailDispatchConfirmations(), "");
  assert.throws(() => buildEmailDispatchConfirmations([job], "https://example.com", ""), /not configured/);
});

test("email section explains forwarding the link, not the private email, and escapes references", () => {
  const links = buildEmailDispatchConfirmations([{ ...job, poNumber: '<script>alert("x")</script>' }], "https://example.com", secret);
  const html = renderEmailDispatchConfirmations(links);
  assert.ok(html.includes("Share with your customer"));
  assert.ok(html.includes("Share the link rather than this entire email"));
  assert.ok(html.includes("No planner sign-in is needed"));
  assert.ok(html.includes("90 days"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes(`href="${links[0].url}"`));
});
