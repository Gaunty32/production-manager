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
import { customers, jobs, stockingOrders, stockingProduction, stockingSamples } from "@shared/schema";
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
  const originalSmallObject = ObjectStorageService.prototype.saveSmallObject;
  let backupUploads = 0;
  ObjectStorageService.prototype.saveSmallObject = async (bytes, contentType) => {
    assert.ok(contentType === "image/png" || contentType === "application/pdf");
    if (contentType === "application/pdf") assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
    backupUploads++;
    return `/objects/uploads/${randomUUID()}`;
  };
  const originalCustomerUser = storage.getCustomerUserById;
  const originalCustomer = storage.getCustomer;
  const photoBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8R8AAAAASUVORK5CYII=", "base64");
  let photoType = "image/png";
  let objectBytes = photoBytes;
  ObjectStorageService.prototype.getObjectEntityFile = async () => ({
    getMetadata: async () => [{ contentType: photoType, size: objectBytes.length }],
    download: async () => [objectBytes.subarray(0, 12)],
    createReadStream: () => Readable.from(objectBytes),
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
    const customerRequest = (path: string, body?: unknown) => fetch(`${base}/api/customer-portal/abode${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-test-customer": "yes" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal((await request(`/orders/${dpd.id}/delivery-note`)).status, 409, "No generated delivery note is available without a supplied PDF");
    assert.equal((await customerRequest(`/orders/${dpd.id}/delivery-note`)).status, 409);
    const notesPreview = await (await customerRequest("/delivery-notes/preview", {
      fileNames: ["dispatch-note-TEST-1.pdf", "dispatch-note-TEST-2.pdf", "dispatch-note-UNKNOWN.pdf", "unmatched.pdf"],
    })).json();
    assert.deepEqual(notesPreview.files.map((file: any) => file.status), ["matched", "matched", "not_found", "invalid"]);
    assert.equal(notesPreview.files[0].jobId, dpd.id);
    const notePayload = { objectKey: `/objects/uploads/${randomUUID()}`, fileName: "dispatch-note-TEST-1.pdf", jobId: dpd.id };
    assert.equal((await request("/delivery-notes", notePayload, false)).status, 401);
    assert.equal((await customerRequest("/delivery-notes", { ...notePayload, jobId: royal.id })).status, 400, "Filename must not attach to a different order");
    assert.equal((await customerRequest("/delivery-notes", notePayload)).status, 400, "Images must not be saved as delivery notes");
    photoType = "application/pdf";
    assert.equal((await request("/delivery-notes", notePayload)).status, 400, "PDF metadata without a PDF header must be rejected");
    objectBytes = Buffer.from("%PDF-1.7\nOriginal first page\nOriginal second page\n%%EOF");
    const backupUpload = (staff: boolean, overrides: Record<string, string> = {}, body: Buffer = objectBytes) => fetch(
      `${base}${staff ? "/api/abode" : "/api/customer-portal/abode"}/delivery-notes/upload`, {
        method: "POST", body, headers: {
          "content-type": "application/pdf", [staff ? "x-test-staff" : "x-test-customer"]: "yes",
          "x-file-name": encodeURIComponent(notePayload.fileName), "x-job-id": dpd.id, ...overrides,
        },
      },
    );
    assert.equal((await backupUpload(true, { "x-job-id": royal.id })).status, 400);
    assert.equal((await backupUpload(false, {}, Buffer.from("<html>not a PDF"))).status, 400);
    assert.equal(backupUploads, 0, "Invalid/mismatched uploads must not write storage");
    assert.equal((await backupUpload(true)).status, 200);
    const customerBackup = await backupUpload(false);
    assert.equal(customerBackup.status, 200);
    assert.match((await customerBackup.json()).key, /^\/objects\/uploads\//);
    assert.equal(backupUploads, 2, "Both roles can upload using the bounded backup");
    assert.equal((await backupUpload(true, {}, Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
    assert.equal(backupUploads, 2, "Oversized uploads must not write storage");
    const staffNote = await (await request("/delivery-notes", notePayload)).json();
    assert.ok(staffNote.id);
    assert.equal((await (await request("/delivery-notes", notePayload)).json()).id, staffNote.id);
    const customerNote = await (await customerRequest("/delivery-notes", { ...notePayload, objectKey: `/objects/uploads/${randomUUID()}` })).json();
    assert.ok(customerNote.id);
    const notesContext = await (await customerRequest("")).json();
    const orderNotes = notesContext.orders.find((o: any) => o.id === dpd.id).deliveryNotes;
    assert.equal(orderNotes.length, 2, "New versions keep earlier delivery notes");
    assert.ok(orderNotes.some((note: any) => note.uploadedBy === "staff"));
    assert.ok(orderNotes.some((note: any) => note.uploadedBy === "customer"));
    const pdf = await customerRequest(`/orders/${dpd.id}/delivery-notes/${customerNote.id}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(pdf.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await pdf.arrayBuffer()), objectBytes, "Print source must preserve the original PDF bytes and pages");
    assert.equal((await customerRequest(`/orders/${royal.id}/delivery-notes/${staffNote.id}`)).status, 404);
    assert.equal((await request(`/orders/${dpd.id}/delivery-notes/${staffNote.id}`, undefined, false)).status, 401);
    const preferredNote = await customerRequest(`/orders/${dpd.id}/delivery-note`);
    assert.equal(preferredNote.status, 200, "Supplied notes can print before production completes");
    assert.equal(preferredNote.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await preferredNote.arrayBuffer()), objectBytes);
    const afterNotesPreview = await (await request("/delivery-notes/preview", { fileNames: ["dispatch-note-TEST-1.pdf"] })).json();
    assert.equal(afterNotesPreview.files[0].existingCount, 2);
    objectBytes = photoBytes;
    photoType = "image/png";
    // Every personalised stocking needs its own current-version sign-off.
    assert.equal((await request(`/orders/${dpd.id}/complete`, {})).status, 400);
    await assert.rejects(() => storage.updateJob(dpd.id, { completed: true }), /customer must approve/);
    await assert.rejects(() => storage.updateJobLineItem(dpd.items[0].id, { completed: true, logoApproved: true }), /customer must approve/);
    const manualApproval = await storage.updateJobLineItem(dpd.items[0].id, { logoApproved: true });
    assert.equal(manualApproval.logoApproved, false, "Staff cannot bypass customer approval with the generic logo checkbox");
    await assert.rejects(() => storage.createProductionEntry({
      lineItemId: dpd.items[0].id, staffId: randomUUID(), quantityCompleted: 1,
      productionTimeMinutes: 1, workDate: new Date(),
    }), /customer must approve/);
    const samplePath = (item: any) => `/orders/${item.jobId}/items/${item.id}/samples`;
    const saveSample = async (item: any) => {
      const response = await request(samplePath(item), { objectKey: `/objects/uploads/${randomUUID()}`, fileName: "digital-proof.png" });
      assert.equal(response.status, 200);
      return response.json();
    };
    // Storage MIME metadata is not authoritative; validate the actual proof bytes.
    objectBytes = Buffer.from("%PDF-1.7\nCharlotte printout\n%%EOF");
    photoType = "application/octet-stream";
    const pdfResponse = await request(samplePath(dpd.items[1]), {
      objectKey: `/objects/uploads/${randomUUID()}`, fileName: "Charlotte_Print.pdf",
    });
    assert.equal(pdfResponse.status, 200, "A real PDF with generic storage metadata must be accepted");
    const pdfProof = await pdfResponse.json();
    const storedPdf = await customerRequest(`${samplePath(dpd.items[1])}/${pdfProof.id}/file`);
    assert.equal(storedPdf.headers.get("content-type"), "application/pdf", "Serve the verified type, not generic storage metadata");
    assert.deepEqual(Buffer.from(await storedPdf.arrayBuffer()), objectBytes);
    photoType = "application/pdf";
    objectBytes = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    assert.equal((await request(samplePath(dpd.items[1]), {
      objectKey: `/objects/uploads/${randomUUID()}`, fileName: "Charlotte.EMB",
    })).status, 400, "Embroidery source bytes must not be served as a PDF");
    photoType = "image/png";
    objectBytes = photoBytes;
    const firstProof = await saveSample(dpd.items[0]);
    const firstReview = `${samplePath(dpd.items[0])}/${firstProof.id}/decision`;
    assert.equal((await request(firstReview, { decision: "approved" })).status, 404, "Staff cannot approve on the customer's behalf");
    assert.equal((await customerRequest(samplePath(dpd.items[0]), {})).status, 404, "Customers cannot create staff digital samples");
    assert.equal((await customerRequest(`/orders/${royal.id}/items/${dpd.items[0].id}/samples/${firstProof.id}/decision`, { decision: "approved" })).status, 400);
    const proofImage = await customerRequest(`${samplePath(dpd.items[0])}/${firstProof.id}/file`);
    assert.equal(proofImage.status, 200);
    assert.deepEqual(Buffer.from(await proofImage.arrayBuffer()), photoBytes);
    assert.equal((await customerRequest(firstReview, { decision: "approved" })).status, 200);
    assert.equal((await customerRequest(firstReview, { decision: "approved" })).status, 200, "Approval retry is idempotent");
    assert.equal((await request(`/orders/${dpd.id}/complete`, {})).status, 400, "Approving one stocking must not approve the whole order");
    const newProof = await saveSample(dpd.items[0]);
    assert.equal(newProof.version, 2);
    assert.equal((await customerRequest(firstReview, { decision: "approved" })).status, 400, "An old sample cannot approve a revised design");
    assert.equal((await storage.getJobLineItem(dpd.items[0].id))?.logoApproved, false);
    const newReview = `${samplePath(dpd.items[0])}/${newProof.id}/decision`;
    assert.equal((await customerRequest(newReview, { decision: "amends_required", notes: "" })).status, 400);
    assert.equal((await customerRequest(newReview, { decision: "amends_required", notes: "Please use gold thread" })).status, 200);
    assert.equal((await customerRequest(newReview, { decision: "approved" })).status, 400, "A requested amendment needs a revised sample, not a changed historical decision");
    const revision = await saveSample(dpd.items[0]);
    assert.equal(revision.version, 3);
    assert.equal((await customerRequest(`${samplePath(dpd.items[0])}/${revision.id}/decision`, { decision: "approved" })).status, 200);
    for (const item of [...dpd.items.slice(1), ...royal.items]) {
      const proof = await saveSample(item);
      assert.equal((await customerRequest(`${samplePath(item)}/${proof.id}/decision`, { decision: "approved" })).status, 200);
    }
    const approvedContext = await (await customerRequest("")).json();
    assert.equal(approvedContext.canApproveSamples, true);
    assert.equal(approvedContext.orders.find((order: any) => order.id === dpd.id).sampleApprovalReady, true);
    const revisionHistory = approvedContext.orders.find((order: any) => order.id === dpd.id).items.find((item: any) => item.id === dpd.items[0].id).digitalSamples;
    assert.deepEqual(revisionHistory.map((sample: any) => sample.status), ["approved", "amends_required", "approved"]);
    assert.equal(revisionHistory[1].customerNotes, "Please use gold thread");
    const [approvedRecord] = await db.select().from(stockingSamples).where(eq(stockingSamples.id, revision.id));
    assert.equal(approvedRecord.decidedByCustomerUserId, id);
    assert.ok(approvedRecord.decidedAt);
    assert.equal((await request(`/orders/${dpd.id}/photos`, { ...photoPayload, objectKey: `/objects/uploads/${randomUUID()}`, lineItemId: dpd.items[0].id })).status, 400, "A finished-photo upload must wait for production");
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
    assert.equal((await request(samplePath(dpd.items[0]), { objectKey: `/objects/uploads/${randomUUID()}`, fileName: "late-revision.png" })).status, 400, "Produced stockings cannot silently replace their approved sample");
    const finalPhoto = await request(`/orders/${dpd.id}/photos`, { ...photoPayload, objectKey: `/objects/uploads/${randomUUID()}`, lineItemId: dpd.items[0].id });
    assert.equal(finalPhoto.status, 200);
    const finalPhotoContext = await (await customerRequest("")).json();
    assert.ok(finalPhotoContext.orders.find((order: any) => order.id === dpd.id).finishedPhotos.some((photo: any) => photo.lineItemId === dpd.items[0].id), "Final photo stays linked to the exact stocking");
    const responses = await Promise.all([request(`/orders/${dpd.id}/book`, { weightGrams: 500 }), request(`/orders/${dpd.id}/book`, { weightGrams: 500 })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal(bookings, 1);
    assert.equal((await storage.getJob(dpd.id))?.shippingCost, "5.5");
    assert.equal((await storage.getJob(dpd.id))?.packageType, "bags");
    assert.equal((await request(`/orders/${dpd.id}/book`, { weightGrams: 500 })).status, 409);
    const note = await request(`/orders/${dpd.id}/delivery-note`);
    assert.equal(note.status, 200);
    assert.equal(note.headers.get("content-type"), "application/pdf", "Uploaded customer note takes precedence over the generated template");
    const label = await request(`/orders/${dpd.id}/label`);
    assert.equal(label.status, 200);
    assert.ok((await label.text()).includes('sandbox="allow-same-origin allow-modals"'));
    await request(`/orders/${royal.id}/complete`, {});
    const missingNote = await request(`/orders/${royal.id}/delivery-note`);
    assert.equal(missingNote.status, 409, "Completing production must not enable the old generated delivery note");
    assert.match((await missingNote.json()).error, /customer-supplied PDF/);
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
    ObjectStorageService.prototype.saveSmallObject = originalSmallObject;
    storage.getCustomerUserById = originalCustomerUser;
    storage.getCustomer = originalCustomer;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(jobs).where(eq(jobs.customerId, customer.id));
    await db.delete(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await pool.end();
  }
});
