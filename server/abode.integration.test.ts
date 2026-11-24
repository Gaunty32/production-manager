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
import PDFDocument from "pdfkit";
import { verifyRecoveredLabelPdf } from "./abodeLabelRecovery";
import { maybeSendAbodeDispatchNotification } from "./abodeDispatchNotifications";
import { maybeSendDispatchNotification } from "./customerOrderNotifications";

async function labelPdf(order: string, tracking: string): Promise<Buffer> {
  const document = new PDFDocument();
  const parts: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", part => parts.push(part));
    document.on("end", () => resolve(Buffer.concat(parts)));
    document.on("error", reject);
  });
  document.text(`Ref ${order}`).text(`Consignment ${tracking}`);
  document.end();
  return result;
}

test("saved PDF recovery verifies both identifiers and rejects wrong or invalid documents", async () => {
  const pdf = await labelPdf("TEST-PDF", "6895132451");
  await verifyRecoveredLabelPdf(pdf, "TEST-PDF", "6895132451");
  await assert.rejects(() => verifyRecoveredLabelPdf(pdf, "OTHER", "6895132451"), /does not match/);
  await assert.rejects(() => verifyRecoveredLabelPdf(pdf, "TEST-PDF", "WRONG12345"), /does not match/);
  await assert.rejects(() => verifyRecoveredLabelPdf(Buffer.from("not pdf"), "TEST-PDF", "6895132451"), /existing DPD label/);
});

test("confirmed delivery dates require actual delivered scans, never a next-day estimate", () => {
  assert.equal(confirmedDeliveryDate({ deliveryDate: "2026-11-12", deliveryStatus: "Data Only" }), null);
  assert.equal(confirmedDeliveryDate({ deliveryDate: "2026-11-12", deliveryStatus: "Out for delivery" }), null);
  assert.equal(confirmedDeliveryDate({ trackingEvents: [{ key: "001", date: "2026-02-30" }] }), null);
  assert.equal(confirmedDeliveryDate({ trackingEvents: [{ type: "Not delivered", date: "2026-11-12" }] }), null);
  assert.equal(confirmedDeliveryDate({ trackingEvents: [{ key: "001", date: "2026-11-12" }] })?.toISOString(), "2026-11-12T12:00:00.000Z");
  assert.equal(confirmedDeliveryDate({ deliveryDate: "2026-07-01", deliveryStatus: "Delivered" })?.toISOString(), "2026-07-01T12:00:00.000Z");
  const booked = new Date("2026-11-02");
  assert.equal(abodeDispatchedAt({ dispatchedAt: null }, { completed: false }), null);
  assert.equal(abodeDispatchedAt({ dispatchedAt: null }, { completed: true }), null, "Completion never infers despatch from booking or tracking");
  assert.equal(abodeDispatchedAt({ dispatchedAt: booked }, { completed: false }), null, "Old auto-despatch markers cannot hide unfinished work");
  assert.equal(abodeDispatchedAt({ dispatchedAt: booked }, { completed: true }), booked, "Historical completed despatches stay intact");
  assert.equal(abodeDispatchedAt({ dispatchedAt: null, deliveredAt: booked }, { completed: false }), booked, "Confirmed delivery is never reversed");
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

test("Abode import → early label → completion → staff despatch, with safe retries", { timeout: 90000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Never run against production");
  const id = randomUUID();
  const [customer] = await db.insert(customers).values({ name: `Abode integration fixture ${id}` }).returning();
  const originals = {
    customers: storage.getCustomers, customer: storage.getCustomer, customerUser: storage.getCustomerUserById,
    customerUsers: storage.getCustomerUsersByCustomerId,
    configured: dpdService.isConfigured, book: dpdService.createShipment, label: dpdService.fetchLabel,
    file: ObjectStorageService.prototype.getObjectEntityFile, small: ObjectStorageService.prototype.saveSmallObject,
  };
  storage.getCustomers = async () => [{ ...customer, name: "Abode Home & Gifts" }];
  storage.getCustomer = async customerId => customerId === customer.id
    ? { ...customer, name: "Abode Home & Gifts" } : originals.customer.call(storage, customerId);
  storage.getCustomerUserById = async () => ({ customerId: customer.id } as any);
  // No real customer contact or email-provider calls from these fixtures.
  storage.getCustomerUsersByCustomerId = async () => [];
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
    if (request.reference === "TEST-RETRY") {
      assert.equal(request.recipient.street, "26 Example Residential Way");
      assert.equal(request.recipient.locality, "Example Place");
    }
    await new Promise(resolve => setTimeout(resolve, 30));
    if (failBooking) throw new Error("Simulated uncertain courier response");
    assert.equal(request.deferLabelFetch, true, "Persist tracking before fetching the label");
    return { trackingNumber: `TEST${bookings}${id}`, labelHtml: "<p>TEST LABEL</p>", parcelNumbers: ["15501234567890"], shipmentJobId: 2689513245121500, trackingUrl: "" };
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
    const [savedBooking] = await db.select().from(stockingOrders).where(eq(stockingOrders.jobId, dpd.id));
    assert.equal(savedBooking.shipmentId, 2689513245121500, "Real-sized DPD IDs must save without integer overflow");
    assert.equal(dpd.dispatchedAt, null, "DPD labels must not bypass production");
    assert.equal(dpd.trackingStatus, "Label created — awaiting despatch");
    assert.equal(dpd.deliveredAt, null);
    assert.equal(dpd.dispatchEmailQueuedAt, null, "Label creation must not queue despatch email");
    assert.equal(dpd.dispatchEmailSentAt, null, "No recipients must not be marked as sent");
    const contacts: any[] = [
      { id: "eligible", active: true, emailNotificationsDispatch: true, email: "abode@example.invalid", firstName: "Abode" },
      { id: "duplicate", active: true, emailNotificationsDispatch: true, email: "ABODE@example.invalid" },
      { id: "disabled", active: false, emailNotificationsDispatch: true, email: "disabled@example.invalid" },
      { id: "opted-out", active: true, emailNotificationsDispatch: false, email: "opted-out@example.invalid" },
    ];
    const messages: { email: string; details: any }[] = [];
    const capture = async (email: string, details: any) => { messages.push({ email, details }); };
    storage.getCustomerUsersByCustomerId = async () => contacts;
    await maybeSendAbodeDispatchNotification(dpd.id, capture);
    await maybeSendAbodeDispatchNotification(dpd.id, capture);
    assert.equal(messages.length, 0, "Early labels must not send despatch emails");
    assert.equal((await storage.getJob(dpd.id))?.dispatchEmailSentAt, null);
    storage.getCustomerUsersByCustomerId = async () => [];
    // Reproduce the reported production data: an old import set both timestamps
    // at label creation even though all stockings were still unfinished.
    await db.update(stockingOrders).set({ dispatchedAt: savedBooking.bookedAt, trackingStatus: "Despatched" }).where(eq(stockingOrders.jobId, dpd.id));
    await db.update(jobs).set({ dispatchEmailQueuedAt: savedBooking.bookedAt }).where(eq(jobs.id, dpd.id));
    storage.getCustomerUsersByCustomerId = async () => contacts;
    await maybeSendAbodeDispatchNotification(dpd.id, capture);
    assert.equal(messages.length, 0, "Old queued emails are blocked while production is unfinished");
    storage.getCustomerUsersByCustomerId = async () => [];
    const legacyContext = await (await request("", undefined, true)).json();
    const legacyOrder = legacyContext.orders.find((o: any) => o.id === dpd.id);
    assert.equal(legacyOrder.dispatchedAt, null, "Existing unfinished orders return to production without a live database write");
    assert.equal(legacyOrder.trackingStatus, "Label created — awaiting despatch");
    const legacyStaffOrder = (await (await request("")).json()).orders.find((o: any) => o.id === dpd.id);
    assert.equal(legacyStaffOrder.dispatchedAt, null, "Staff and customers see the same corrected status");
    assert.equal(await hasUndespatchedAbodeOrder([dpd.id]), true, "Legacy non-null timestamps cannot fool the despatch guard");
    assert.equal(legacyOrder.deliveredAt, null);
    assert.equal((await request(`/orders/${dpd.id}/label`)).status, 200, "Label printable before production");
    assert.equal((await request(`/orders/${dpd.id}/book`, {})).status, 400);
    assert.equal(bookings, 1);
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {})).status, 400, "A pre-booked label cannot bypass unfinished production");
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
    const completedOrder = await storage.getJob(dpd.id);
    assert.equal(completedOrder?.completed, true);
    assert.equal(completedOrder?.invoiceStatus, "ready", "Completing in Abode puts the order into draft invoicing without the main queue");
    const items = await storage.getJobLineItems(dpd.id);
    assert.deepEqual(items.map(item => item.agreedUnitPrice).sort(), [5, 5, 7]);
    assert.equal(calculateJobPrice(items).totalPrice, 17);
    assert.equal((await request(`/orders/${dpd.id}/complete`, {})).status, 200);
    assert.equal((await storage.getJob(dpd.id))?.invoiceStatus, "ready", "Completion retries keep the draft invoice ready");
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    assert.equal(count.count, 102, "Completion retries preserve lifetime count");
    assert.equal(await hasUndespatchedAbodeOrder([dpd.id]), true, "Completing work must still await explicit despatch");
    assert.equal((await storage.getJob(dpd.id))?.dispatchEmailQueuedAt, null, "Obsolete unsent queues are cleared, not retried on completion");
    const readyOrder = (await (await request("")).json()).orders.find((o: any) => o.id === dpd.id);
    assert.equal(readyOrder.dispatchedAt, null, "The old auto-despatch marker must not reappear after completion");
    assert.equal(readyOrder.labelAvailable, true, "The original label survives the correction");
    assert.equal(readyOrder.dhlTrackingNumber, dpd.dhlTrackingNumber);
    storage.getCustomerUsersByCustomerId = async () => contacts;
    await maybeSendAbodeDispatchNotification(dpd.id, capture);
    assert.equal(messages.length, 0, "Production completion alone sends nothing");
    storage.getCustomerUsersByCustomerId = async () => [];
    assert.equal((await request(`/orders/${dpd.id}/dispatch`, {})).status, 200, "Staff explicitly confirm despatch after production");
    assert.equal(await hasUndespatchedAbodeOrder([dpd.id]), false);
    storage.getCustomerUsersByCustomerId = async () => contacts;
    await maybeSendAbodeDispatchNotification(dpd.id, capture);
    await maybeSendAbodeDispatchNotification(dpd.id, capture);
    assert.equal(messages.length, 1, "Only staff-confirmed despatch sends once per eligible contact");
    assert.equal(messages[0].email, "abode@example.invalid");
    assert.equal(messages[0].details.orderNumber, dpd.orderNumber);
    assert.equal(messages[0].details.trackingNumber, dpd.dhlTrackingNumber);
    assert.ok(messages[0].details.trackingUrl.includes("postcode="));
    storage.getCustomerUsersByCustomerId = async () => [];
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
    dpdService.fetchLabel = async () => "<p>OTHER-ORDER RECOVERED12345</p>";
    const existingPayload = { trackingNumber: "RECOVERED12345", shipmentId: 2689513245121500 };
    assert.equal((await request(`/orders/${failedId}/recover`, existingPayload)).status, 409, "Never attach another order's label");
    dpdService.fetchLabel = async () => "<p>TEST-FAILED RECOVERED12345</p>";
    assert.equal((await request(`/orders/${failedId}/recover`, existingPayload)).status, 200, "Existing shipment restores label and tracking without another purchase");
    const [recovered] = await db.select().from(stockingOrders).where(eq(stockingOrders.jobId, failedId));
    assert.equal(recovered.shipmentId, existingPayload.shipmentId);
    assert.equal(recovered.shipmentState, "booked");
    assert.ok(recovered.labelHtml?.includes("TEST-FAILED"));
    assert.equal(recovered.dispatchedAt, null, "Label recovery does not confirm despatch");
    assert.equal(recovered.trackingStatus, "Label created — awaiting despatch");
    assert.equal(bookings, before);
    const labelResponse = await request(`/orders/${failedId}/label?format=pdf`);
    assert.equal(labelResponse.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await labelResponse.arrayBuffer()).subarray(0,5).toString(), "%PDF-");
    assert.equal((await storage.getJob(failedId))?.dispatchEmailQueuedAt, null, "Recovery must not queue email");
    const pdfImport = await (await request("/imports", { rows: [{ ...row, "Order number": "TEST-PDF" }] })).json();
    const pdfJobId = pdfImport.labelResults[0].jobId;
    const noMoreBookings = bookings;
    dpdService.fetchLabel = async () => null;
    const unavailable = await request(`/orders/${pdfJobId}/recover`, { shipmentId: 2689513245121501, trackingNumber: "SAVEDPDF12345" });
    assert.equal(unavailable.status, 409);
    assert.match((await unavailable.json()).error, /saved label PDF/);
    const uploadPdf = (pdf: Buffer) => fetch(`${base}/api/abode/orders/${pdfJobId}/recover?shipmentId=2689513245121501&trackingNumber=SAVEDPDF12345`, {
      method: "POST", headers: { "x-test-staff": "yes", "content-type": "application/pdf" }, body: new Uint8Array(pdf),
    });
    assert.equal((await uploadPdf(await labelPdf("WRONG-ORDER", "SAVEDPDF12345"))).status, 400);
    bytes = await labelPdf("TEST-PDF", "SAVEDPDF12345");
    assert.equal((await uploadPdf(bytes)).status, 200);
    const pdfOrder = (await (await request("")).json()).orders.find((o: any) => o.id === pdfJobId);
    assert.equal(pdfOrder.labelAvailable, true);
    assert.equal(pdfOrder.dispatchedAt, null, "Saved-PDF recovery must also await staff confirmation");
    assert.equal(pdfOrder.dhlTrackingNumber, "SAVEDPDF12345");
    assert.equal(pdfOrder.deliveredAt, null);
    // The reported orders already received an email under the old policy.
    // Correct their production state without destroying that audit or resending.
    const wronglySentAt = new Date("2026-11-18T07:46:59.347Z");
    await db.update(stockingOrders).set({ dispatchedAt: new Date(), trackingStatus: "Despatched" }).where(eq(stockingOrders.jobId, pdfJobId));
    await db.update(jobs).set({ dispatchEmailQueuedAt: wronglySentAt, dispatchEmailSentAt: wronglySentAt }).where(eq(jobs.id, pdfJobId));
    await storage.updateJob(pdfJobId, { completed: true });
    const correctedPdfOrder = (await (await request("")).json()).orders.find((o: any) => o.id === pdfJobId);
    assert.equal(correctedPdfOrder.dispatchedAt, null, "Generic completion also clears legacy false despatch");
    assert.equal(correctedPdfOrder.dhlTrackingNumber, pdfOrder.dhlTrackingNumber);
    assert.equal(correctedPdfOrder.labelAvailable, true);
    assert.equal((await storage.getJob(pdfJobId))?.dispatchEmailSentAt?.toISOString(), wronglySentAt.toISOString(), "The original email audit is preserved");
    assert.equal((await request(`/orders/${pdfJobId}/dispatch`, {})).status, 200);
    storage.getCustomerUsersByCustomerId = async () => contacts;
    await maybeSendAbodeDispatchNotification(pdfJobId, capture);
    assert.equal(messages.length, 1, "Orders already emailed under the old policy do not send a duplicate");
    storage.getCustomerUsersByCustomerId = async () => [];
    const originalLabel = await request(`/orders/${pdfJobId}/label?format=pdf`);
    assert.equal(originalLabel.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await originalLabel.arrayBuffer()), bytes);
    assert.equal(bookings, noMoreBookings, "Recovering the saved PDF never purchases another shipment");
    const manualImport = await (await request("/imports", { rows: [{ ...row, "Order number": "TEST-ALREADY-SENT" }] })).json();
    const manualId = manualImport.labelResults[0].jobId;
    const bookingsBeforeConfirmation = bookings;
    assert.equal((await request(`/orders/${manualId}/dispatch`, {}, true)).status, 404, "No customer despatch route is exposed");
    assert.equal((await request(`/orders/${manualId}/dispatch`, {})).status, 400, "Unfinished production must remain blocked");
    assert.equal((await request(`/orders/${manualId}/complete`, {})).status, 200);
    const confirmations = await Promise.all([
      request(`/orders/${manualId}/dispatch`, {}), request(`/orders/${manualId}/dispatch`, {}),
    ]);
    assert.ok(confirmations.every(response => response.status === 200), "Repeated confirmations are safe");
    const confirmed = (await (await request("", undefined, true)).json()).orders.find((o: any) => o.id === manualId);
    assert.ok(confirmed.dispatchedAt, "Staff confirmation moves the order into Despatched");
    assert.equal(confirmed.labelAvailable, false);
    assert.equal(confirmed.dhlTrackingNumber, null);
    assert.equal(confirmed.deliveredAt, null, "Despatch must never imply delivery");
    assert.equal(confirmed.shipmentState, "review", "Do not claim the uncertain booking was recovered");
    assert.equal(confirmed.trackingStatus, "Despatched");
    assert.ok((await storage.getJob(manualId))?.dispatchEmailQueuedAt, "A new confirmed despatch queues an email even without tracking");
    const queuedManual = (await storage.getJob(manualId))!.dispatchEmailQueuedAt!.toISOString();
    storage.getCustomerUsersByCustomerId = async () => contacts;
    await maybeSendAbodeDispatchNotification(manualId, async () => { throw new Error("Simulated provider failure"); });
    assert.equal((await storage.getJob(manualId))?.dispatchEmailSentAt, null, "Provider failures remain pending");
    await maybeSendAbodeDispatchNotification(manualId, capture);
    assert.equal(messages.length, 2, "A second order gets its own email");
    assert.equal(messages[1].details.trackingNumber, null);
    assert.equal(messages[1].details.trackingUrl, null);
    assert.notEqual(messages[0].details.idempotencyKey, messages[1].details.idempotencyKey);
    storage.getCustomerUsersByCustomerId = async () => [];
    assert.equal(bookings, bookingsBeforeConfirmation, "Manual confirmation never buys a shipment");
    assert.equal(await hasUndespatchedAbodeOrder([manualId]), false);
    const trackingEntries = [{ orderNumber: confirmed.orderNumber, trackingNumber: "6895132451" }];
    assert.equal((await fetch(`${base}/api/abode/tracking/import`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-customer": "yes" },
      body: JSON.stringify({ entries: trackingEntries }),
    })).status, 401, "Customers cannot change shipment tracking");
    assert.equal((await request("/tracking/import", { entries: [
      ...trackingEntries, { orderNumber: "999999999999", trackingNumber: "6895132452" },
    ] })).status, 409);
    assert.equal((await storage.getJob(manualId))?.dhlTrackingNumber, null, "A bad batch saves nothing");
    assert.equal((await request("/tracking/import", { entries: [
      ...trackingEntries, { orderNumber: "999999999999", trackingNumber: "6895132451" },
    ] })).status, 409, "A consignment cannot be reused across orders");
    assert.equal((await request("/tracking/import", { entries: [{ ...trackingEntries[0], trackingNumber: "123" }] })).status, 409);
    assert.equal((await request("/tracking/import", { entries: trackingEntries })).status, 200);
    assert.equal((await request("/tracking/import", { entries: trackingEntries })).status, 200, "Retrying is safe");
    assert.equal((await request("/tracking/import", { entries: [{ ...trackingEntries[0], trackingNumber: "6895132452" }] })).status, 409, "Existing tracking cannot be replaced");
    const tracked = (await (await request("", undefined, true)).json()).orders.find((order: any) => order.id === manualId);
    assert.equal(tracked.dhlTrackingNumber, "6895132451", "Tracking is exposed by the customer's own API");
    assert.equal(tracked.dispatchedAt, confirmed.dispatchedAt);
    assert.equal(tracked.deliveredAt, null);
    assert.equal(tracked.shipmentState, "review", "Adding tracking does not claim the label was recovered");
    assert.equal((await storage.getJob(manualId))?.dispatchEmailQueuedAt?.toISOString(), queuedManual, "Adding historical tracking never queues another email");
    assert.equal(bookings, bookingsBeforeConfirmation, "Tracking import never buys a shipment");
    await db.update(jobs).set({ dispatchEmailQueuedAt: null, dispatchEmailSentAt: null }).where(eq(jobs.id, failedId));
    await maybeSendDispatchNotification(failedId);
    assert.equal((await storage.getJob(failedId))?.dispatchEmailQueuedAt, null, "Generic completion calls never catch up old Abode orders automatically");
    failBooking = true;
    const retryImport = await (await request("/imports", { rows: [{
      ...row, "Order number": "TEST-RETRY", "Address line 1": "26 Example Residential Way",
      "Address line 2": "Example Place",
    }] })).json();
    const retryId = retryImport.labelResults[0].jobId;
    assert.equal(retryImport.labelResults[0].status, "review");
    const beforeRetry = bookings;
    assert.equal((await request(`/orders/${retryId}/book`, { confirmNoExistingBooking: "yes" })).status, 400);
    await request(`/orders/${retryId}/book`, {});
    assert.equal(bookings, beforeRetry, "Review still blocks ordinary booking attempts");
    assert.equal((await request(`/orders/${retryId}/book`, { confirmNoExistingBooking: true }, true)).status, 404);
    failBooking = false;
    const attempts = await Promise.all([
      request(`/orders/${retryId}/book`, { confirmNoExistingBooking: true }),
      request(`/orders/${retryId}/book`, { confirmNoExistingBooking: true }),
    ]);
    assert.equal(attempts.filter(response => response.ok).length, 1);
    assert.equal(bookings, beforeRetry + 1, "Explicitly confirmed retries still allow only one concurrent purchase");
    assert.equal((await storage.getJob(retryId))?.dispatchEmailQueuedAt, null);
    await db.update(stockingOrders).set({ shipmentState: "review" }).where(eq(stockingOrders.jobId, retryId));
    await db.update(jobs).set({ dhlTrackingNumber: null }).where(eq(jobs.id, retryId));
    assert.equal((await request(`/orders/${retryId}/book`, { confirmNoExistingBooking: true })).ok, false);
    assert.equal(bookings, beforeRetry + 1, "Saved shipment details block retry even when tracking is absent");
    failBooking = true;
    const missingImport = await (await request("/imports", { rows: [{ ...row, "Order number": "TEST-TRACKING-REVIEW" }] })).json();
    const missingId = missingImport.labelResults[0].jobId;
    const beforeTrackingSave = bookings;
    const existingTracking = { entries: [{ orderNumber: "TEST-TRACKING-REVIEW", trackingNumber: "6565279532" }] };
    assert.equal((await request("/tracking/import", existingTracking)).status, 200, "Staff can save an existing booking's tracking before despatch without its PDF");
    assert.equal((await request("/tracking/import", existingTracking)).status, 200, "Repeated tracking saves are idempotent");
    const missingOrder = (await (await request("", undefined, true)).json()).orders.find((order: any) => order.id === missingId);
    assert.equal(missingOrder.dhlTrackingNumber, "6565279532");
    assert.equal(missingOrder.completed, false);
    assert.equal(missingOrder.dispatchedAt, null);
    assert.equal(missingOrder.bookedAt, null, "Do not invent a booking date");
    assert.equal(missingOrder.deliveredAt, null);
    assert.equal(missingOrder.labelAvailable, false, "Tracking alone does not create a saved label");
    assert.equal((await storage.getJob(missingId))?.dispatchEmailQueuedAt, null);
    assert.equal((await request(`/orders/${missingId}/book`, { confirmNoExistingBooking: true })).ok, false);
    assert.equal(bookings, beforeTrackingSave, "Saving tracking blocks rebooking and never buys a shipment");
  } finally {
    storage.getCustomers = originals.customers; storage.getCustomer = originals.customer; storage.getCustomerUserById = originals.customerUser;
    storage.getCustomerUsersByCustomerId = originals.customerUsers;
    dpdService.isConfigured = originals.configured; dpdService.createShipment = originals.book; dpdService.fetchLabel = originals.label;
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
