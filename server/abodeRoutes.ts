import { raw, type Express, type RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { customers, jobs, jobLineItems, jobFiles, stockingOrders, stockingProduction } from "@shared/schema";
import { ABODE_CARRIAGE, ABODE_CUSTOMER_NAME, isAbodeCustomer, stockingRate, stockingBagNetworkCode } from "@shared/abode";
import { parseStockingRows } from "./abodeImport";
import { completeStockingOrder } from "./abodeProduction";
import { renderStockingLabel } from "./abodeDocuments";
import { dpdService } from "./dpd";
import { maybeSendDispatchNotification } from "./customerOrderNotifications";
import { ObjectStorageService } from "./objectStorage";
import { FINISHED_PHOTO_PREFIX, FINISHED_PHOTO_TYPES, MAX_FINISHED_PHOTO_BYTES, isFinishedPhoto, photoBytesMatchType } from "./abodePhotos";
import { DELIVERY_NOTE_PREFIX, MAX_DELIVERY_NOTE_BYTES, deliveryNoteOrderNumber, isSuppliedDeliveryNote, hasPdfSignature } from "./abodeDeliveryNotes";

type CompletionGuard = (req: any, jobId: string, item?: any) => Promise<string | null>;
const editable = (status: string) => ["pending", "ready", "draft"].includes(status);
const pdfBodyParser = raw({ type: "application/pdf", limit: MAX_DELIVERY_NOTE_BYTES });
const readDeliveryNotePdf: RequestHandler = (req, res, next) => {
  pdfBodyParser(req, res, error => {
    if (error) {
      res.status(error.status === 413 ? 413 : 400).json({ error: "Choose a valid PDF delivery note up to 10 MB" });
      return;
    }
    next();
  });
};
export function registerAbodeRoutes(app: Express, deps: {
  staffAuth: RequestHandler; customerAuth: RequestHandler; completionGuard: CompletionGuard;
}) {
  for (const customerMode of [false, true]) {
    const base = customerMode ? "/api/customer-portal/abode" : "/api/abode";
    const auth = customerMode ? deps.customerAuth : deps.staffAuth;
    const wrap = (handler: (req: any, res: any, customer: any) => Promise<any>): RequestHandler => async (req: any, res) => {
      res.set("Cache-Control", "no-store");
      try {
        let customer;
        if (customerMode) {
          const user = await storage.getCustomerUserById(req.session.impersonationCustomerUserId || req.session.customerUserId);
          customer = user ? await storage.getCustomer(user.customerId) : null;
          if (!isAbodeCustomer(customer)) {
            if (req.method === "GET" && req.path === base) return void res.json({ enabled: false });
            return void res.status(403).json({ error: "This workflow is only available to Abode Home & Gifts" });
          }
        } else {
          customer = (await storage.getCustomers()).find(isAbodeCustomer);
        }
        await handler(req, res, customer);
      } catch (error) {
        const message = error instanceof z.ZodError ? "Check the spreadsheet or form values" : error instanceof Error ? error.message : "Could not process the stocking order";
        console.error("[Abode] Request failed:", message);
        if (!res.headersSent) res.status(400).json({ error: message });
      }
    };
    const owned = async (jobId: string, customer: any) => {
      if (!customer) throw new Error("Abode customer has not been created yet");
      const [order] = await db.select().from(stockingOrders).where(and(eq(stockingOrders.jobId, jobId), eq(stockingOrders.customerId, customer.id)));
      const job = order ? await storage.getJob(jobId) : null;
      if (!order || !job || job.customerId !== customer.id) throw new Error("Order not found");
      return { order, job };
    };
    app.get(base, auth, wrap(async (_req, res, customer) => {
      if (!customer) return res.json({ enabled: true, customer: { id: "", name: ABODE_CUSTOMER_NAME, logoUrl: null }, completedCount: 0, currentRate: 7, orders: [] });
      const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(stockingProduction).where(eq(stockingProduction.customerId, customer.id));
      const orders = await db.select({ order: stockingOrders, job: jobs }).from(stockingOrders)
        .innerJoin(jobs, eq(jobs.id, stockingOrders.jobId)).where(eq(stockingOrders.customerId, customer.id)).orderBy(desc(jobs.jobNumber));
      const items = orders.length ? await db.select().from(jobLineItems).where(inArray(jobLineItems.jobId, orders.map(({ job }) => job.id))) : [];
      const files = orders.length ? await db.select().from(jobFiles).where(inArray(jobFiles.jobId, orders.map(({ job }) => job.id))).orderBy(desc(jobFiles.createdAt)) : [];
      const photos = files.filter(isFinishedPhoto);
      const deliveryNotes = files.filter(isSuppliedDeliveryNote);
      res.json({
        enabled: true, customer: { id: customer.id, name: customer.name, logoUrl: customer.logoUrl },
        completedCount: count.count, currentRate: stockingRate(count.count),
        orders: orders.map(({ order, job }) => ({
          ...job, recipient: order.recipient, shippingRoute: order.shippingRoute,
          shipmentState: order.shipmentState, labelAvailable: Boolean(order.labelHtml || order.shipmentId),
          items: items.filter(item => item.jobId === job.id),
          finishedPhotos: photos.filter(photo => photo.jobId === job.id).map(photo => ({
            id: photo.id, fileName: photo.fileName.slice(FINISHED_PHOTO_PREFIX.length),
            fileUrl: `${base}/orders/${encodeURIComponent(job.id)}/photos/${encodeURIComponent(photo.id)}`,
            createdAt: photo.createdAt,
          })),
          deliveryNotes: deliveryNotes.filter(note => note.jobId === job.id).map(note => ({
            id: note.id, fileName: note.fileName.slice(DELIVERY_NOTE_PREFIX.length),
            fileUrl: `${base}/orders/${encodeURIComponent(job.id)}/delivery-notes/${encodeURIComponent(note.id)}`,
            createdAt: note.createdAt, uploadedBy: note.uploadedBy,
          })),
        })),
      });
    }));
    for (const preview of [true, false]) {
      app.post(`${base}/imports${preview ? "/preview" : ""}`, auth, wrap(async (req, res, customer) => {
        const parsed = parseStockingRows(req.body.rows);
        const existing = customer ? await db.select().from(stockingOrders).where(eq(stockingOrders.customerId, customer.id)) : [];
        if (preview) return res.json({
          orders: parsed.map(({ importHash, ...order }) => {
            const prior = existing.find(row => row.orderNumber === order.orderNumber);
            return { ...order, existing: Boolean(prior), detailsChanged: Boolean(prior && prior.importHash !== importHash) };
          }),
          stockingCount: parsed.reduce((n, order) => n + order.items.length, 0), orderCount: parsed.length,
        });
        const result = await db.transaction(async tx => {
          // Same number allocator as ordinary customer submissions. The whole
          // workbook commits together; retries and parallel uploads are safe.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(71024001)`);
          let target = customer;
          if (!target) {
            const [priorCustomer] = await tx.select().from(customers).where(eq(customers.name, ABODE_CUSTOMER_NAME));
            target = priorCustomer || (await tx.insert(customers).values({ name: ABODE_CUSTOMER_NAME }).returning())[0];
          }
          const [maximum] = await tx.select({ number: sql<number>`coalesce(max(job_number),0)::int` }).from(jobs);
          let nextNumber = maximum.number;
          let created = 0, skipped = 0;
          const flaggedOrders: { orderNumber: string; detailsChanged: boolean }[] = [];
          for (const order of parsed) {
            const [prior] = await tx.select().from(stockingOrders).where(and(eq(stockingOrders.customerId, target.id), eq(stockingOrders.orderNumber, order.orderNumber)));
            if (prior) {
              skipped++;
              flaggedOrders.push({ orderNumber: order.orderNumber, detailsChanged: prior.importHash !== order.importHash });
              continue;
            }
            const r = order.recipient;
            const [job] = await tx.insert(jobs).values({
              jobNumber: ++nextNumber, customerId: target.id, jobName: `Stockings — ${order.orderNumber}`,
              poNumber: order.orderNumber, requestedJobType: "Embroidery Initials/Name",
              quantity: order.items.length, status: "production", submittedAt: new Date(),
              submittedById: customerMode ? req.session.impersonationCustomerUserId || req.session.customerUserId : null,
              shippingMethod: "direct_delivery", packageType: "bags", packageCount: 1,
              shippingCost: String(ABODE_CARRIAGE), deliveryAddressType: "custom",
              shippingCarrier: order.shippingRoute === "dpd" ? "dpd" : "royal_mail",
              deliveryAddress: [r.name, r.line1, r.line2, r.town, r.county, r.postcode].filter(Boolean).join("\n"),
              notes: "Abode stocking order. Preserve all names exactly as supplied, including capitalisation. See each stocking's colour, font and thread. Confirm stock and font samples before production.",
            }).returning();
            await tx.insert(stockingOrders).values({
              jobId: job.id, customerId: target.id, orderNumber: order.orderNumber, importHash: order.importHash,
              recipient: order.recipient, shippingRoute: order.shippingRoute,
            });
            await tx.insert(jobLineItems).values(order.items.map(item => ({
              jobId: job.id, jobType: "Embroidery Initials/Name", quantity: 1, stitchCount: 0,
              description: `Stocking: ${item.colour} | ${item.font} | Thread: ${item.thread} | Name: ${item.name}`,
              stockingDetails: item, logoApproved: false, awaitingStock: true,
            })));
            created++;
          }
          return { created, skipped, flaggedOrders };
        });
        res.json(result);
      }));
    }
    app.get(`${base}/orders/:id/delivery-note`, auth, wrap(async (req, res, customer) => {
      const { job } = await owned(req.params.id, customer);
      const [suppliedNote] = (await storage.getJobFiles(job.id)).filter(isSuppliedDeliveryNote)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (suppliedNote) return res.redirect(`${base}/orders/${encodeURIComponent(job.id)}/delivery-notes/${encodeURIComponent(suppliedNote.id)}`);
      return res.status(409).json({ error: "Upload the customer-supplied PDF delivery note for this order before printing. Generated delivery notes are no longer used for Abode." });
    }));
    app.post(`${base}/delivery-notes/preview`, auth, wrap(async (req, res, customer) => {
      const { fileNames } = z.object({ fileNames: z.array(z.string().trim().min(1).max(200)).min(1).max(50) }).parse(req.body);
      const orders = customer ? await db.select().from(stockingOrders).where(eq(stockingOrders.customerId, customer.id)) : [];
      const files = orders.length ? (await db.select().from(jobFiles).where(inArray(jobFiles.jobId, orders.map(order => order.jobId)))).filter(isSuppliedDeliveryNote) : [];
      res.json({ files: fileNames.map(fileName => {
        const orderNumber = deliveryNoteOrderNumber(fileName);
        const order = orders.find(order => order.orderNumber === orderNumber);
        return {
          fileName, orderNumber, jobId: order?.jobId || null,
          status: !orderNumber ? "invalid" : order ? "matched" : "not_found",
          existingCount: order ? files.filter(file => file.jobId === order.jobId).length : 0,
        };
      }) });
    }));
    app.post(`${base}/delivery-notes/upload`, auth, readDeliveryNotePdf, wrap(async (req, res, customer) => {
      const { fileName, jobId } = z.object({
        fileName: z.string().trim().min(1).max(200), jobId: z.string().min(1).max(100),
      }).parse({ fileName: decodeURIComponent(req.get("x-file-name") || ""), jobId: req.get("x-job-id") });
      const { order } = await owned(jobId, customer);
      if (deliveryNoteOrderNumber(fileName) !== order.orderNumber) {
        return res.status(400).json({ error: "The PDF filename does not match this order number. Nothing has been attached." });
      }
      if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > MAX_DELIVERY_NOTE_BYTES || !hasPdfSignature(req.body)) {
        return res.status(400).json({ error: "Choose a valid PDF delivery note up to 10 MB" });
      }
      const key = await new ObjectStorageService().saveSmallObject(req.body, "application/pdf");
      res.json({ key });
    }));
    app.post(`${base}/delivery-notes`, auth, wrap(async (req, res, customer) => {
      const { objectKey, fileName, jobId } = z.object({
        objectKey: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i),
        fileName: z.string().trim().min(1).max(200), jobId: z.string().min(1).max(100),
      }).parse(req.body);
      const { order, job } = await owned(jobId, customer);
      if (deliveryNoteOrderNumber(fileName) !== order.orderNumber) {
        return res.status(400).json({ error: "The PDF filename does not match this order number. Nothing has been attached." });
      }
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(objectKey);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size);
      if (metadata.contentType !== "application/pdf" || !Number.isFinite(size) || size <= 0 || size > MAX_DELIVERY_NOTE_BYTES) {
        return res.status(400).json({ error: "Choose a PDF delivery note up to 10 MB" });
      }
      const [signature] = await file.download({ start: 0, end: 7 });
      if (!hasPdfSignature(signature)) return res.status(400).json({ error: "This file is not a PDF delivery note" });
      const note = await storage.createJobFile({
        jobId: job.id, fileName: `${DELIVERY_NOTE_PREFIX}${fileName}`, fileUrl: objectKey,
        fileSize: size, fileType: "application/pdf", uploadedBy: customerMode ? "customer" : "staff",
        uploaderId: customerMode ? req.session.impersonationCustomerUserId || req.session.customerUserId : req.session.userId,
      });
      res.json({ id: note.id, success: true, orderNumber: order.orderNumber });
    }));
    app.get(`${base}/orders/:id/delivery-notes/:noteId`, auth, wrap(async (req, res, customer) => {
      const { job } = await owned(req.params.id, customer);
      const note = (await storage.getJobFiles(job.id)).find(file => file.id === req.params.noteId && isSuppliedDeliveryNote(file));
      if (!note) return res.status(404).json({ error: "Delivery note not found" });
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(note.fileUrl);
      const [metadata] = await file.getMetadata();
      res.set({
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        "Cache-Control": "private, no-store", "Content-Type": "application/pdf", "Content-Length": String(metadata.size),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(note.fileName.slice(DELIVERY_NOTE_PREFIX.length)).replace(/'/g, "%27")}`,
      });
      await pipeline(file.createReadStream(), res);
    }));
    app.get(`${base}/orders/:id/photos/:photoId`, auth, wrap(async (req, res, customer) => {
      const { job } = await owned(req.params.id, customer);
      const photo = (await storage.getJobFiles(job.id)).find(file => file.id === req.params.photoId && isFinishedPhoto(file));
      if (!photo) return res.status(404).json({ error: "Finished-item photo not found" });
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(photo.fileUrl);
      const [metadata] = await file.getMetadata();
      res.set({
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store", "Content-Type": photo.fileType,
        "Content-Length": String(metadata.size),
      });
      await pipeline(file.createReadStream(), res);
    }));
    if (customerMode) continue;
    app.post(`${base}/orders/:id/photos`, auth, wrap(async (req, res, customer) => {
      const { job } = await owned(req.params.id, customer);
      const { objectKey, fileName } = z.object({
        objectKey: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i),
        fileName: z.string().trim().min(1).max(200),
      }).parse(req.body);
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(objectKey);
      const [metadata] = await file.getMetadata();
      const type = metadata.contentType || "";
      const size = Number(metadata.size);
      if (!FINISHED_PHOTO_TYPES.some(allowed => allowed === type) || !Number.isFinite(size) || size <= 0 || size > MAX_FINISHED_PHOTO_BYTES) {
        return res.status(400).json({ error: "Choose a JPEG, PNG or WebP photo up to 10 MB" });
      }
      const [signature] = await file.download({ start: 0, end: 11 });
      if (!photoBytesMatchType(signature, type)) return res.status(400).json({ error: "This file is not a supported photo" });
      const photo = await storage.createJobFile({
        jobId: job.id, fileName: `${FINISHED_PHOTO_PREFIX}${fileName}`, fileUrl: objectKey,
        fileSize: size, fileType: type, uploadedBy: "staff", uploaderId: req.session.userId,
      });
      res.json({ id: photo.id, success: true });
    }));
    app.post(`${base}/logo`, auth, wrap(async (req, res, customer) => {
      if (!customer) throw new Error("Import Abode's first order before adding a logo");
      const user = await storage.getUser(req.session.userId);
      if (!user || !["super_admin", "admin", "manager"].includes(user.role)) return res.status(403).json({ error: "Manager access required" });
      const { logoUrl } = z.object({ logoUrl: z.string().max(2000).refine(value => /^https:\/\/[^\s]+$/.test(value) || /^\/objects\/[^\s]+$/.test(value)) }).parse(req.body);
      await storage.updateCustomer(customer.id, { logoUrl });
      res.json({ success: true });
    }));
    app.post(`${base}/orders/:id/complete`, auth, wrap(async (req, res, customer) => {
      const { job } = await owned(req.params.id, customer);
      const denied = await deps.completionGuard(req, job.id);
      if (denied) return res.status(403).json({ error: denied });
      const person = (await storage.getStaff()).find(person => person.userId === req.session.userId && person.active !== false);
      await completeStockingOrder(job.id, person?.id || null);
      res.json({ success: true });
    }));
    app.post(`${base}/orders/:id/book`, auth, wrap(async (req, res, customer) => {
      const { order, job } = await owned(req.params.id, customer);
      if (order.shippingRoute !== "dpd") return res.status(409).json({ error: "Book this address through Parcel2Go using Royal Mail" });
      if (!job.completed) return res.status(409).json({ error: "Complete production before booking dispatch" });
      if (!editable(job.invoiceStatus)) return res.status(409).json({ error: "This order has already been invoiced" });
      if (job.dhlTrackingNumber) return res.status(409).json({ error: "This order already has tracking. Use its existing label; do not book twice." });
      const { weightGrams } = z.object({ weightGrams: z.coerce.number().int().min(100).max(5000) }).parse(req.body);
      if (!dpdService.isConfigured()) return res.status(503).json({ error: "DPD is not configured" });
      const claimed = await db.update(stockingOrders).set({ shipmentState: "booking" }).where(and(
        eq(stockingOrders.jobId, job.id), eq(stockingOrders.shipmentState, "unbooked"),
      )).returning();
      if (!claimed.length) return res.status(409).json({ error: "Booking has already been attempted. Check DPD and recover its tracking number; do not book again." });
      try {
        const r = order.recipient;
        const result = await dpdService.createShipment({
          recipient: { name: r.name, street: [r.line1, r.line2].filter(Boolean).join(", "), city: r.town, zipCode: r.postcode, country: "GB" },
          parcels: [{ weight: weightGrams, customerReference: order.orderNumber }], reference: order.orderNumber,
          networkCode: stockingBagNetworkCode(weightGrams),
        });
        try {
          await db.transaction(async tx => {
            await tx.update(stockingOrders).set({ shipmentState: "booked", labelHtml: result.labelHtml, shipmentId: result.shipmentJobId }).where(eq(stockingOrders.jobId, job.id));
            await tx.update(jobs).set({
              dhlTrackingNumber: result.trackingNumber, shippingCost: String(ABODE_CARRIAGE),
              shippingMethod: "direct_delivery", packageType: "bags", packageCount: 1,
              dispatchEmailQueuedAt: new Date(),
            }).where(eq(jobs.id, job.id));
          });
        } catch {
          // A courier purchase cannot be rolled back. Return recovery material
          // without suggesting another paid booking.
          return res.json({ trackingNumber: result.trackingNumber, labelHtml: result.labelHtml, warning: "DPD booked the parcel but saving failed. Keep this tracking number and label, then recover the booking. Do not book again." });
        }
        await maybeSendDispatchNotification(job.id).catch(() => console.error("[Abode] Dispatch email deferred"));
        res.json({ trackingNumber: result.trackingNumber, labelAvailable: Boolean(result.labelHtml) });
      } catch (error) {
        await db.update(stockingOrders).set({ shipmentState: "review" }).where(eq(stockingOrders.jobId, job.id));
        throw new Error(`DPD booking needs review. Check your DPD account before doing anything else; do not rebook. ${error instanceof Error ? error.message : ""}`);
      }
    }));
    for (const recovery of [false, true]) {
      app.post(`${base}/orders/:id/${recovery ? "recover" : "royal-mail"}`, auth, wrap(async (req, res, customer) => {
        const { order, job } = await owned(req.params.id, customer);
        if (!job.completed) return res.status(409).json({ error: "Complete production first" });
        if (!editable(job.invoiceStatus)) return res.status(409).json({ error: "Invoiced dispatch details cannot be changed here" });
        if (recovery ? order.shippingRoute !== "dpd" || !["booking", "review"].includes(order.shipmentState) : order.shippingRoute !== "royal_mail") {
          return res.status(409).json({ error: "This action does not match this order's shipping route" });
        }
        const { trackingNumber } = z.object({ trackingNumber: z.string().trim().min(5).max(80).regex(/^[A-Za-z0-9 -]+$/) }).parse(req.body);
        await db.transaction(async tx => {
          const [locked] = await tx.select().from(jobs).where(eq(jobs.id, job.id)).for("update");
          if (!editable(locked.invoiceStatus)) throw new Error("This order has already been invoiced");
          if (locked.dhlTrackingNumber && locked.dhlTrackingNumber !== trackingNumber) throw new Error("Tracking already recorded; review the existing shipment");
          await tx.update(jobs).set({
            dhlTrackingNumber: trackingNumber, shippingCost: String(ABODE_CARRIAGE),
            shippingMethod: "direct_delivery", packageType: "bags", packageCount: 1, dispatchEmailQueuedAt: new Date(),
          }).where(eq(jobs.id, job.id));
          await tx.update(stockingOrders).set({ shipmentState: "booked" }).where(eq(stockingOrders.jobId, job.id));
        });
        await maybeSendDispatchNotification(job.id).catch(() => {});
        res.json({ success: true });
      }));
    }
    app.get(`${base}/orders/:id/label`, auth, wrap(async (req, res, customer) => {
      const { order } = await owned(req.params.id, customer);
      let label = order.labelHtml;
      if (!label && order.shipmentId) {
        label = await dpdService.fetchLabel(order.shipmentId);
        if (label) await db.update(stockingOrders).set({ labelHtml: label }).where(eq(stockingOrders.jobId, order.jobId));
      }
      if (!label) return res.status(404).json({ error: "No saved DPD label. Retrieve the existing label from DPD; do not book again." });
      const nonce = randomBytes(16).toString("base64");
      res.set({
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-src 'self' about:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
        "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex",
      }).type("html").send(renderStockingLabel(label, nonce));
    }));
  }
}
