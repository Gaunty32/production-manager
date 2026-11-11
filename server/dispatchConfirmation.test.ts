import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { MEROX_DISPATCH_CUSTOMER_ID, canShareDispatchConfirmation } from "../shared/dispatch-confirmation";
import { createDispatchToken, verifyDispatchToken } from "./dispatchConfirmationTokens";
import { renderDispatchConfirmationPage } from "./dispatchConfirmationPage";
import { registerDispatchConfirmationRoutes } from "./dispatchConfirmationRoutes";
import type { IStorage } from "./storage";

const secret = "test-only-dispatch-signing-secret";
const job = {
  id: "10000000-0000-4000-8000-000000000001",
  customerId: MEROX_DISPATCH_CUSTOMER_ID,
  jobNumber: 2241,
  poNumber: "MEROX-PO-123",
  jobName: "PRIVATE PRODUCTION NAME",
  notes: "PRIVATE STAFF NOTES",
  deliveryAddress: "PRIVATE ADDRESS",
  invoiceTotal: 123456,
  completed: true,
  status: "completed",
  shippingMethod: "direct_delivery",
  dhlTrackingNumber: "TEST-TRACKING-NUMBER",
  dispatchEmailQueuedAt: new Date("2026-07-01T12:30:00Z"),
};

test("sharing is restricted to completed, tracked Merox DPD orders", () => {
  assert.equal(canShareDispatchConfirmation(job), true);
  assert.equal(canShareDispatchConfirmation({ ...job, shippingMethod: "consolidated" }), true);
  for (const changes of [
    { customerId: "other-customer" }, { completed: false }, { status: "cancelled" },
    { status: "pending_customer_approval" }, { dhlTrackingNumber: "" },
    { dhlTrackingNumber: "  " }, { shippingMethod: "Collection" },
    { shippingCarrier: "royal_mail" },
  ]) assert.equal(canShareDispatchConfirmation({ ...job, ...changes }), false);
});

test("tokens are signed, purpose-bound, expiring and conceal the tracking number", () => {
  const now = Date.now();
  const token = createDispatchToken(job, secret, now);
  assert.equal(verifyDispatchToken(token, secret, now)?.jobId, job.id);
  assert.equal(verifyDispatchToken(token, "wrong secret", now), null);
  assert.equal(verifyDispatchToken(token, secret, now + 90 * 86400 * 1000), null);
  assert.equal(verifyDispatchToken(token.slice(0, -3) + "aaa", secret, now), null);
  assert.equal(verifyDispatchToken("invalid", secret), null);
  assert.equal(verifyDispatchToken(token, ""), null);
  assert.equal(verifyDispatchToken("a".repeat(1500), secret), null);
  assert.equal(Buffer.from(token.split(".")[0], "base64url").toString().includes(job.dhlTrackingNumber), false);
  assert.throws(() => createDispatchToken(job, ""), /not configured/);
});

test("renderer escapes content, rejects unsafe logo URLs and formats British summer time", () => {
  const html = renderDispatchConfirmationPage({
    brandName: 'Merox <script>alert("brand")</script>',
    logoUrl: 'javascript:alert("logo")',
    reference: '<img src=x onerror="alert(1)">',
    dispatchRecordedAt: "2026-07-01T12:30:00Z",
  });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("13:30"));
  assert.ok(html.includes("noindex,nofollow,noarchive"));
  assert.ok(html.includes("no-referrer"));
  assert.ok(html.includes("no live delivery updates"));
  assert.ok(!html.includes("handed over"));
  assert.doesNotThrow(() => renderDispatchConfirmationPage({
    brandName: "Merox", logoUrl: null, reference: "PO 1", dispatchRecordedAt: "invalid",
  }));
});

test("public renderer has no planner branding, outbound tracking or fabricated missing dates", () => {
  const html = renderDispatchConfirmationPage({
    brandName: "Merox", logoUrl: "https://example.com/logo.png",
    reference: "PO 1", dispatchRecordedAt: null,
  });
  assert.ok(!/select branding|planner|track\.dpd|DPD.*Tracking Number/i.test(html));
  assert.ok(!html.includes("<a "));
  assert.ok(html.includes("Dispatch date has not been recorded"));
  assert.ok(!html.includes("Dispatch recorded</dt>"));
  assert.ok(renderDispatchConfirmationPage(null).includes("unavailable"));
});

test("tracking button only links to DPD Local and keeps postcode encoding safe", () => {
  const data = {
    brandName: "Merox", logoUrl: null, reference: "PO 1", dispatchRecordedAt: null,
    trackingUrl: "https://track.dpdlocal.co.uk/search?reference=1234567890&postcode=SW1A+1AA",
  };
  const html = renderDispatchConfirmationPage(data);
  assert.ok(html.includes('class="tracking-button"'));
  assert.ok(html.includes("Track your parcel"));
  assert.ok(html.includes("reference=1234567890&amp;postcode=SW1A+1AA"));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!html.includes("There are no live delivery updates"));
  for (const trackingUrl of ["javascript:alert(1)", "https://evil.example/search", "https://track.dpdlocal.co.uk.evil.example/search"]) {
    assert.ok(!renderDispatchConfirmationPage({ ...data, trackingUrl }).includes('class="tracking-button"'));
  }
});

test("routes enforce ownership, Merox-only scope, eligibility and minimal public output", async () => {
  let currentJob = { ...job };
  const storage = {
    getCustomerUserById: async (id: string) => ({
      customerId: id === "merox-user" ? MEROX_DISPATCH_CUSTOMER_ID : "another-customer",
    }),
    getJob: async (id: string) => id === job.id ? currentJob : undefined,
    getCustomer: async () => ({ name: "Merox", logoUrl: "https://example.com/logo.png" }),
  } as unknown as Pick<IStorage, "getCustomerUserById" | "getJob" | "getCustomer">;
  const app = express();
  registerDispatchConfirmationRoutes(app, {
    storage, getSecret: () => secret,
    authenticateCustomer: (req, res, next) => {
      if (!req.get("x-test-user")) return void res.sendStatus(401);
      (req as any).session = { customerUserId: req.get("x-test-user") };
      next();
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const path = `/api/customer-portal/jobs/${job.id}/dispatch-confirmation`;
  const create = (user?: string) => fetch(base + path, {
    method: "POST", headers: user ? { "x-test-user": user } : {},
  });
  try {
    assert.equal((await create()).status, 401);
    assert.equal((await create("another-user")).status, 404);
    const created = await create("merox-user");
    assert.equal(created.status, 200);
    assert.equal(created.headers.get("cache-control"), "no-store");
    const { path: publicPath } = await created.json();
    const page = await fetch(base + publicPath);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.ok(page.headers.get("content-security-policy")?.includes("default-src 'none'"));
    assert.equal(page.headers.get("referrer-policy"), "no-referrer");
    assert.ok(html.includes(job.poNumber));
    assert.ok(html.includes(`https://track.dpdlocal.co.uk/search?reference=${job.dhlTrackingNumber}`));
    assert.ok(html.includes("Track your parcel"));
    for (const privateValue of [job.jobName, job.notes, job.deliveryAddress, "123456", "Select Branding"]) {
      assert.ok(!html.includes(privateValue), `Public output leaked ${privateValue}`);
    }
    currentJob = { ...job, dhlTrackingNumber: "REPLACEMENT-TRACKING" };
    assert.equal((await fetch(base + publicPath)).status, 404);
    currentJob = { ...job, completed: false };
    assert.equal((await create("merox-user")).status, 403);
    assert.equal((await fetch(base + publicPath)).status, 404);
    currentJob = { ...job, customerId: "another-customer" };
    assert.equal((await create("another-user")).status, 403);
    assert.equal((await fetch(base + publicPath)).status, 404);
    assert.equal((await fetch(base + "/delivery-update/invalid")).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
