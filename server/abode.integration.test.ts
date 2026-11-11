// Isolated development fixtures only. Courier and storage are stubbed;
// this test never buys a real shipment or sends customer email.
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { customers, jobs, jobFiles, stockingOrders, stockingProduction, stockingSamples } from "@shared/schema";
import { storage } from "./storage";
import { registerAbodeRoutes } from "./abodeRoutes";
import { dpdService } from "./dpd";
import { calculateJobPrice } from "../shared/pricing";
import { ObjectStorageService } from "./objectStorage";
import { abodeDispatchedAt, hasUndespatchedAbodeOrder } from "./abodeShipping";
import { confirmedDeliveryDate, lookupAbodeTracking } from "./abodeTracking";

test("confirmed delivery dates require actual delivered scans, never a next-day estimate", () => {
  assert.equal(confirmedDeliveryDate({ deliveryDate: "2026-11-12", deliveryStatus: "Data Only" }), null);
  assert.equal(confirmedDeliveryDate({ deliveryDate: "2026-11-12", deliveryStatus: "Out for delivery" }), null);
  assert.equal(confirmedDeliveryDate({ trackingEvents: [{ key: "001", date: "2026-02-30" }] }), null);
  assert.equal(confirmedDeliveryDate({ trackingEvents: [{ type: "Not delivered", date: "2026-11-12" }] }), null);
  assert.equal(confirmedDeliveryDate({ trackingEvents: [{ key: "001", date: "2026-11-12" }] })?.toISOString(), "2026-11-12T12:00:00.000Z");
  assert.equal(confirmedDeliveryDate({ deliveryDate: "2026-07-01", deliveryStatus: "Delivered" })?.toISOString(), "2026-07-01T12:00:00.000Z");
  assert.equal(abodeDispatchedAt({ bookedAt: new Date(), dispatchedAt: null }, { dhlTrackingNumber: "123", dispatchEmailQueuedAt: new Date() }), null);
  const historic = new Date("2026-11-01");
  assert.equal(abodeDispatchedAt({ bookedAt: null, dispatchedAt: null }, { dhlTrackingNumber: "123", dispatchEmailQueuedAt: historic }), historic);
});

test("DPD tracking paginates reference searches and matches the saved shipment, not another order", async () => {
  const originalFetch = globalThis.fetch;
  let mode = "pending", pages = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).endsWith("/auth/access")) return Response.json({ data: { accessToken: "offline-test-token" } });
    const query = JSON.parse(init.body);
    if (query.searchKey) {
      pages++;
      return Response.json({ data: { parcelDetails: [{ consignmentNumber: "UNRELATED", parcelNumber: "15501234567891", deliveryStatus: "Delivered", deliveryDate: "2026-11-10" }] } });
    }
    assert.equal(query.customerReference, "TEST-REF");
    assert.equal(query.postcode, "SW1A 1AA");
    if (mode === "missing") return Response.json({ data: { parcelDetails: [] } });
    return Response.json({ data: {
      totalResults: mode === "pending" ? 11 : 1, searchKey: "offline-page-key",
      parcelDetails: [{
        consignmentNumber: "SAVED123", parcelNumber: "15501234567890",
        deliveryStatus: mode === "pending" ? "Data Only" : "Delivered", deliveryDate: "2026-11-12",
      }],
    } });
  }) as typeof fetch;
  try {
    const order = { orderNumber: "TEST-REF", recipient: { postcode: "SW1A 1AA" }, parcelNumbers: [] } as any;
    const pending = await lookupAbodeTracking(order, "SAVED123");
    assert.equal(pages, 1, "Later search-result pages are read");
    assert.equal(pending.deliveredAt, null, "An unrelated delivered parcel must not mark our shipment delivered");
    mode = "delivered";
    assert.equal((await lookupAbodeTracking(order, "SAVED123")).deliveredAt?.toISOString(), "2026-11-12T12:00:00.000Z");
    mode = "missing";
    await assert.rejects(() => lookupAbodeTracking(order, "SAVED123"), /has not returned tracking scans/);
  } finally { globalThis.fetch = originalFetch; }
});

test("Abode import → early label → no approval → photo → actual despatch, with safe retries", { timeout: 90000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Never run against production");
  const id = randomUUID();
  const [customer] = await db.insert(customers).values({ name: `Abode integration fixture ${id}` }).returning();
  const originals = {
    customers: storage.getCustomers, customer: storage.getCustomer, customerUser: storage.getCustomerUserById,
    configured: dpdService.isConfigured, book: dpdService.createShipment,
    file: ObjectStorageService.prototype.getObjectEntityFile, small: ObjectStorageService.prototype.saveSmallObject,
  };
  storage.getCustomers = async () => [{ ...customer, name: "Abode Home & Gifts" }];
  storage.getCustomer = async customerId => customerId === customer.id
    ? { ...customer, name: "Abode Home & Gifts" } : originals.customer.call(storage, customerId);
  storage.getCustomerUserById = async () => ({ customerId: customer.id } as any);
  dpdService.isConfigured = () => true;
  let bookings = 0, failBooking = false, objectType = "application/pdf";
  let bytes = Buffer.from("%PDF-1.7\nOriginal retail delivery note\n%%EOF");
  ObjectStorageService.prototype.getObjectEntityFile = async () => ({
    getMetadata: async () => [{ contentType: objectType, size: bytes.length }],
    download: async () => [bytes.subarray(0, 12)], createReadStream: () => Readable.from(bytes),
  } as any);
  ObjectStorageService.prototype.saveSmallObject = async () => `/objects/uploads/${randomUUID()}`;
  dpdService.createShipment = async request => {
    bookings++;
    assert.equal(request.networkCode, "2^32", "Expresspak 5 Next Day");
    assert.equal(request.parcels[0].weight, 4000, "Agreed default 4 kg");
    assert.equal(request.parcels.length, 1);
    await new Promise(resolve => setTimeout(resolve, 30));
    if (failBooking) throw new Error("Simulated uncertain courier response");
    return { trackingNumber: `TEST${bookings}${id}`, labelHtml: "<p>TEST LABEL</p>", parcelNumbers: ["15501234567890"], shipmentJobId: 123, trackingUrl: "" };
  };
  const app = express();
  app.use(express.json());
  registerAbodeRoutes(app, {
    staffAuth: (req: any, res, next) => {
      if (req.get("x-test-staff") !== "yes") return void res.sendStatus(401);
      req.session = { userId: id }; next();
    },
    customerAuth: (req: any, res, next) => {
      if (req.get("x-test-customer") !== "yes") return void res.sendStatus(401);
      req.session = { customerUserId: id }; next();
    }, completionGuard: async () => null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, body?: unknown, customerMode = false) => fetch(`${base}/api/${customerMode ? "customer-portal/" : ""}abode${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", [customerMode ? "x-test-customer" : "x-test-staff"]: "yes" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const row = { "Order number": "TEST-1", "Stocking colour": "Red", Font: "Font 1", "Thread colour": "Gold", Name: "Exact CAPS", "Delivery name": "Test Recipient", "Address line 1": "1 Test Street", Town: "London", Postcode: "SW1A 1AA" };
  const rows = [row, { ...row, Name: "McDonald" }, { ...row, Name: "lowercase" }, { ...row, "Order number": "TEST-2", Postcode: "IV1 1AA" }];
  try {
    assert.equal((await fetch(`${base}/api/abode`)).status, 401);
    assert.equal((await request("/imports/preview", { rows })).status, 200);
    assert.equal(bookings, 0, "Preview must not buy labels");
    const imported = await (await request("/imports", { rows })).json();
    assert.equal(imported.created, 2);
    assert.deepEqual(imported.labelResults.map((r: any) => r.status), ["booked", "royal_mail"]);
    assert.equal(bookings, 1);
    const repeated = await (await request("/imports", { rows: rows.slice().reverse() })).json();
    assert.equal(repeated.created, 0);
    assert.equal(repeated.skipped, 2);
    assert.equal(bookings, 1, "Import retries must not buy another label");
    const context = await (await request("")).json();
    const dpd = context.orders.find((o: any) => o.orderNumber === "TEST-1");
    const royal = context.orders.find((o: any) => o.orderNumber === "TEST-2");
    assert.equal(context.canApproveSamples, false);
    assert.equal(dpd.completed, false);
    assert.equal(dpd.sampleApprovalReady, true);
    assert.ok(dpd.bookedAt && dpd.labelAvailable && dpd.dhlTrackingNumber);
    assert.equal(dpd.dispatchedAt, null);
    assert.equal(dpd.deliveredAt, null);
    assert.equal(dpd.dispatchEmailQueuedAt, null, "Booking cannot queue a despatch email");
    assert.equal((await request(`/orders/${dpd.id}/label`)).status, 200, "Label printable before production");
    assert.equal((await request(`/orders/${dpd.id}/book`, {})).status, 400);
    assert.equal(bookings, 1);
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {})).status, 400);
    assert.equal((await request(`/orders/${dpd.id}/book`, {}, true)).status, 404, "Customer cannot manually book");
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {}, true)).status, 404, "Customer cannot confirm despatch");
    const historicalSample = (await db.insert(stockingSamples).values({
      lineItemId: dpd.items[0].id, version: 1, fileName: "historic.png", fileType: "image/png",
      fileUrl: `/objects/uploads/${randomUUID()}`, fileSize: 1, status: "pending_approval", uploadedById: id,
    }).returning())[0];
    assert.equal((await request(`/orders/${dpd.id}/items/${dpd.items[0].id}/samples/${historicalSample.id}/decision`, { decision: "approved" }, true)).status, 409);
    assert.equal((await request(`/orders/${dpd.id}/items/${dpd.items[0].id}/samples`, {})).status, 409);
    const savedItem = await storage.updateJobLineItem(dpd.items[0].id, { logoApproved: false });
    assert.equal(savedItem.logoApproved, true, "Legacy pending samples cannot put stockings on hold");
    const photo = { objectKey: `/objects/uploads/${randomUUID()}`, fileName: "finished.png", lineItemId: dpd.items[0].id };
    assert.equal((await request(`/orders/${dpd.id}/photos`, photo)).status, 400, "Finished photo requires finished stocking");
    await db.insert(stockingProduction).values(Array.from({ length: 99 }, () => ({ lineItemId: randomUUID(), customerId: customer.id, unitPrice: 7 })));
    await storage.updateJobLineItem(dpd.items[0].id, { completed: true });
    assert.equal((await request(`/orders/${dpd.id}/complete`, {})).status, 200, "No sample approval required");
    const items = await storage.getJobLineItems(dpd.id);
    assert.deepEqual(items.map(item => item.agreedUnitPrice).sort(), [5, 5, 7]);
    assert.equal(calculateJobPrice(items).totalPrice, 17);
    assert.equal((await request(`/orders/${dpd.id}/complete`, {})).status, 200);
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    assert.equal(count.count, 102, "Completion retries preserve lifetime count");
    assert.equal(await hasUndespatchedAbodeOrder([dpd.id]), true, "Completion plus early tracking must not trigger despatch email");
    assert.equal((await storage.getJob(dpd.id))?.dispatchEmailQueuedAt, null);
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {})).status, 400, "Delivery note must be saved before actual despatch");
    objectType = "image/png";
    bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8R8AAAAASUVORK5CYII=", "base64");
    const savedPhoto = await (await request(`/orders/${dpd.id}/photos`, photo)).json();
    const retryPhoto = await (await request(`/orders/${dpd.id}/photos`, photo)).json();
    assert.equal(savedPhoto.id, retryPhoto.id);
    const photosContext = await (await request("", undefined, true)).json();
    assert.ok(photosContext.orders.find((o: any) => o.id === dpd.id).finishedPhotos.some((p: any) => p.lineItemId === dpd.items[0].id));
    assert.equal((await request(`/orders/${royal.id}/photos/${savedPhoto.id}`, undefined, true)).status, 404);
    objectType = "application/pdf";
    bytes = Buffer.from("%PDF-1.7\nOriginal retail delivery note\n%%EOF");
    const preview = await (await request("/delivery-notes/preview", { fileNames: ["dispatch-note-TEST-1.pdf", "dispatch-note-MISSING.pdf", "invoice-TEST-1.pdf"] }, true)).json();
    assert.deepEqual(preview.files.map((file: any) => file.status), ["matched", "not_found", "invalid"]);
    const note = { objectKey: `/objects/uploads/${randomUUID()}`, fileName: "dispatch-note-TEST-1.pdf", jobId: dpd.id };
    const concurrent = await Promise.all([
      request("/delivery-notes", note), request("/delivery-notes", { ...note, objectKey: `/objects/uploads/${randomUUID()}` }, true),
    ]);
    assert.ok(concurrent.every(response => response.status === 200));
    const noteResults = await Promise.all(concurrent.map(response => response.json()));
    assert.equal(noteResults[0].id, noteResults[1].id, "Staff/customer racing uploads keep just one note");
    assert.equal(noteResults.filter(result => result.skipped).length, 1);
    assert.equal((await request("/delivery-notes", { ...note, jobId: royal.id })).status, 400);
    const attached = await (await request("", undefined, true)).json();
    const orderWithNote = attached.orders.find((o: any) => o.id === dpd.id);
    assert.equal(orderWithNote.deliveryNotes.length, 1);
    const originalPdf = await request(`/orders/${dpd.id}/delivery-notes/${noteResults[0].id}`, undefined, true);
    assert.deepEqual(Buffer.from(await originalPdf.arrayBuffer()), bytes);
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {})).status, 200);
    const dispatched = await (await request("")).json();
    const dispatchedOrder = dispatched.orders.find((o: any) => o.id === dpd.id);
    assert.ok(dispatchedOrder.dispatchedAt);
    assert.equal(dispatchedOrder.deliveredAt, null, "Despatch is not delivery");
    assert.equal(await hasUndespatchedAbodeOrder([dpd.id]), false);
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {})).status, 200);
    assert.equal((await (await request("")).json()).orders.find((o: any) => o.id === dpd.id).dispatchedAt, dispatchedOrder.dispatchedAt);
    assert.equal((await request(`/orders/${royal.id}/complete`, {})).status, 200);
    assert.equal((await request(`/orders/${royal.id}/royal-mail`, { trackingNumber: "RMTEST123456GB" })).status, 200);
    const royalContext = (await (await request("")).json()).orders.find((o: any) => o.id === royal.id);
    assert.equal(royalContext.dispatchedAt, null, "Recording Royal Mail tracking also does not claim despatch");
    assert.equal(bookings, 1);
    failBooking = true;
    const failed = await (await request("/imports", { rows: [{ ...row, "Order number": "TEST-FAILED" }] })).json();
    assert.equal(failed.created, 1, "Courier failure must not undo imported order");
    assert.equal(failed.labelResults[0].status, "review");
    const failedId = failed.labelResults[0].jobId;
    const before = bookings;
    await Promise.all([request(`/orders/${failedId}/book`, {}), request(`/orders/${failedId}/book`, {})]);
    assert.equal(bookings, before, "Uncertain purchase must never be retried automatically");
    assert.equal((await request(`/orders/${failedId}/recover`, { trackingNumber: "RECOVERED12345" })).status, 200, "Early booking can be recovered before completion");
    assert.equal((await storage.getJob(failedId))?.dispatchEmailQueuedAt, null);
  } finally {
    storage.getCustomers = originals.customers; storage.getCustomer = originals.customer; storage.getCustomerUserById = originals.customerUser;
    dpdService.isConfigured = originals.configured; dpdService.createShipment = originals.book;
    ObjectStorageService.prototype.getObjectEntityFile = originals.file; ObjectStorageService.prototype.saveSmallObject = originals.small;
    const fixtures = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.customerId, customer.id));
    for (const fixture of fixtures) await db.delete(jobFiles).where(eq(jobFiles.jobId, fixture.id));
    await db.delete(jobs).where(eq(jobs.customerId, customer.id));
    await db.delete(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
