// Development-only integration tests; all rows use a temporary customer and are
// removed in finally. DPD is stubbed: this test never buys a courier shipment.
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { customers, jobs, stockingOrders, stockingProduction } from "@shared/schema";
import { storage } from "./storage";
import { registerAbodeRoutes } from "./abodeRoutes";
import { dpdService } from "./dpd";
import { calculateJobPrice } from "../shared/pricing";
import { ObjectStorageService } from "./objectStorage";

test("import → completion threshold → dispatch → draft billing with safe retries", { timeout: 60000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Never run against production");
  const id = randomUUID();
  const [customer] = await db.insert(customers).values({ name: `Abode integration fixture ${id}`, logoUrl: "https://example.com/abode-logo.png" }).returning();
  const originalCustomers = storage.getCustomers;
  const originalConfigured = dpdService.isConfigured;
  const originalBook = dpdService.createShipment;
  const originalObjectFile = ObjectStorageService.prototype.getObjectEntityFile;
  const originalCustomerUser = storage.getCustomerUserById;
  const originalCustomer = storage.getCustomer;
  const photoBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8R8AAAAASUVORK5CYII=", "base64");
  let photoType = "image/png";
  ObjectStorageService.prototype.getObjectEntityFile = async () => ({
    getMetadata: async () => [{ contentType: photoType, size: photoBytes.length }],
    download: async () => [photoBytes.subarray(0, 12)],
    createReadStream: () => Readable.from(photoBytes),
  } as any);
  storage.getCustomerUserById = async () => ({ customerId: customer.id } as any);
  storage.getCustomer = async customerId => customerId === customer.id
    ? { ...customer, name: "Abode Home & Gifts" } : originalCustomer.call(storage, customerId);
  let bookings = 0;
  storage.getCustomers = async () => [{ ...customer, name: "Abode Home & Gifts" }];
  dpdService.isConfigured = () => true;
  dpdService.createShipment = async request => {
    bookings++;
    assert.equal(request.parcels.length, 1);
    assert.equal(request.recipient.zipCode, "SW1A 1AA");
    assert.equal(request.networkCode, "2^68");
    await new Promise(resolve => setTimeout(resolve, 50));
    return { trackingNumber: `TEST${id}`, labelHtml: "<p>TEST LABEL</p>", parcelNumbers: ["TEST"], shipmentJobId: 123, trackingUrl: "" };
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
    },
    completionGuard: async () => null,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, body?: unknown, authenticated = true) => fetch(`${base}/api/abode${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(authenticated ? { "x-test-staff": "yes" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const row = { "Order number": "TEST-1", "Stocking colour": "Red", Font: "Font 1", "Thread colour": "Gold", Name: "Exact CAPS", "Delivery name": "Test Recipient", "Address line 1": "1 Test Street", Town: "London", Postcode: "SW1A 1AA" };
  const rows = [row, { ...row, Name: "McDonald" }, { ...row, Name: "lowercase" }, { ...row, "Order number": "TEST-2", Postcode: "IV1 1AA" }];
  try {
    assert.equal((await request("", undefined, false)).status, 401);
    const preview = await request("/imports/preview", { rows });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).orderCount, 2);
    assert.equal((await request("/imports", { rows })).status, 200);
    const repeat = await request("/imports", { rows: rows.slice().reverse() });
    const repeatResult = await repeat.json();
    assert.equal(repeatResult.created, 0);
    assert.equal(repeatResult.skipped, 2);
    assert.equal(repeatResult.flaggedOrders.length, 2);
    assert.ok(repeatResult.flaggedOrders.every((order: any) => !order.detailsChanged));
    const changedRows = [{ ...row, Name: "CHANGED" }, { ...row, "Order number": "TEST-3" }];
    const repeatPreview = await (await request("/imports/preview", { rows: changedRows })).json();
    assert.equal(repeatPreview.orders[0].existing, true);
    assert.equal(repeatPreview.orders[0].detailsChanged, true);
    assert.equal(repeatPreview.orders[1].existing, false);
    const mixed = await (await request("/imports", { rows: changedRows })).json();
    assert.equal(mixed.created, 1);
    assert.equal(mixed.skipped, 1);
    assert.deepEqual(mixed.flaggedOrders, [{ orderNumber: "TEST-1", detailsChanged: true }]);
    const context = await (await request("")).json();
    const dpd = context.orders.find((o: any) => o.poNumber === "TEST-1");
    const royal = context.orders.find((o: any) => o.poNumber === "TEST-2");
    assert.equal(dpd.items.length, 3);
    assert.ok(dpd.items.some((item: any) => item.stockingDetails.name === "Exact CAPS"), "Repeat upload must not overwrite personalisation");
    assert.ok(!dpd.items.some((item: any) => item.stockingDetails.name === "CHANGED"));
    const photoPayload = { objectKey: `/objects/uploads/${randomUUID()}`, fileName: "finished-stocking.png" };
    assert.equal((await request(`/orders/${dpd.id}/photos`, photoPayload, false)).status, 401);
    assert.equal((await request(`/orders/${randomUUID()}/photos`, photoPayload)).status, 400);
    photoType = "image/svg+xml";
    assert.equal((await request(`/orders/${dpd.id}/photos`, photoPayload)).status, 400);
    photoType = "image/jpeg";
    assert.equal((await request(`/orders/${dpd.id}/photos`, photoPayload)).status, 400, "Mismatched signatures must be rejected");
    photoType = "image/png";
    const photoResponse = await request(`/orders/${dpd.id}/photos`, photoPayload);
    assert.equal(photoResponse.status, 200);
    const photoSaved = await photoResponse.json();
    const photoRetry = await (await request(`/orders/${dpd.id}/photos`, photoPayload)).json();
    assert.equal(photoRetry.id, photoSaved.id, "Saving the same uploaded object twice must be idempotent");
    const withPhotos = await (await request("")).json();
    assert.equal(withPhotos.orders.find((o: any) => o.id === dpd.id).finishedPhotos.length, 1);
    assert.equal((await request(`/orders/${royal.id}/photos/${photoSaved.id}`)).status, 404);
    assert.equal((await request(`/orders/${dpd.id}/photos/${photoSaved.id}`, undefined, false)).status, 401);
    const customerContext = await (await fetch(`${base}/api/customer-portal/abode`, { headers: { "x-test-customer": "yes" } })).json();
    const customerPhoto = customerContext.orders.find((o: any) => o.id === dpd.id).finishedPhotos[0];
    assert.equal(customerPhoto.fileName, "finished-stocking.png");
    const customerImage = await fetch(`${base}${customerPhoto.fileUrl}`, { headers: { "x-test-customer": "yes" } });
    assert.equal(customerImage.status, 200);
    assert.equal(customerImage.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await customerImage.arrayBuffer()), photoBytes);
    assert.equal((await fetch(`${base}/api/customer-portal/abode/orders/${dpd.id}/photos`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-customer": "yes" }, body: JSON.stringify(photoPayload),
    })).status, 404, "Customers must not upload finished-work photos");
    assert.equal(royal.shippingRoute, "royal_mail");
    assert.equal(dpd.shippingCost, "5.5");
    assert.equal((await request(`/orders/${dpd.id}/book`, { weightGrams: 500 })).status, 409);
    assert.equal(bookings, 0);
    // Seed prior production for this isolated test customer only.
    await db.insert(stockingProduction).values(Array.from({ length: 99 }, () => ({ lineItemId: randomUUID(), customerId: customer.id, unitPrice: 7 })));
    assert.equal((await request(`/orders/${dpd.id}/complete`, {})).status, 200);
    const items = await storage.getJobLineItems(dpd.id);
    assert.deepEqual(items.map(item => item.agreedUnitPrice).sort(), [5, 5, 7]);
    assert.equal(calculateJobPrice(items).totalPrice, 17);
    await request(`/orders/${dpd.id}/complete`, {});
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    assert.equal(count.count, 102, "Repeat completion must not count twice");
    assert.equal((await storage.getJob(dpd.id))?.invoiceStatus, "ready");
    const responses = await Promise.all([request(`/orders/${dpd.id}/book`, { weightGrams: 500 }), request(`/orders/${dpd.id}/book`, { weightGrams: 500 })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal(bookings, 1);
    assert.equal((await storage.getJob(dpd.id))?.shippingCost, "5.5");
    assert.equal((await storage.getJob(dpd.id))?.packageType, "bags");
    assert.equal((await request(`/orders/${dpd.id}/book`, { weightGrams: 500 })).status, 409);
    const note = await request(`/orders/${dpd.id}/delivery-note`);
    assert.equal(note.status, 200);
    assert.ok((await note.text()).includes("Exact CAPS"));
    const label = await request(`/orders/${dpd.id}/label`);
    assert.equal(label.status, 200);
    assert.ok((await label.text()).includes('sandbox="allow-same-origin allow-modals"'));
    await request(`/orders/${royal.id}/complete`, {});
    assert.equal((await request(`/orders/${royal.id}/book`, { weightGrams: 500 })).status, 409);
    assert.equal((await request(`/orders/${royal.id}/royal-mail`, { trackingNumber: "AB123456789GB" })).status, 200);
    const savedRoyal = await storage.getJob(royal.id);
    assert.equal(savedRoyal?.shippingCarrier, "royal_mail");
    assert.equal(savedRoyal?.shippingCost, "5.5");
    assert.equal(savedRoyal?.dhlTrackingNumber, "AB123456789GB");
    assert.equal(bookings, 1, "Royal Mail must not buy DPD");
    const [order] = await db.select().from(stockingOrders).where(eq(stockingOrders.jobId, royal.id));
    assert.equal(order.shipmentState, "booked");
    await storage.updateJobLineItem(items[0].id, { completed: false });
    await storage.updateJobLineItem(items[0].id, { completed: true, completedAt: "2026-11-06T12:00:00Z" as any });
    const [after] = await db.select({ count: sql<number>`count(*)::int` }).from(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    assert.equal(after.count, 103, "Reopening must not advance lifetime threshold twice");
  } finally {
    storage.getCustomers = originalCustomers;
    dpdService.isConfigured = originalConfigured;
    dpdService.createShipment = originalBook;
    ObjectStorageService.prototype.getObjectEntityFile = originalObjectFile;
    storage.getCustomerUserById = originalCustomerUser;
    storage.getCustomer = originalCustomer;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(jobs).where(eq(jobs.customerId, customer.id));
    await db.delete(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await pool.end();
  }
});
