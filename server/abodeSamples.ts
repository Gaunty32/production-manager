import { raw, type Express, type RequestHandler } from "express";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { jobs, jobLineItems, stockingSamples, productionEntries } from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";
import { photoBytesMatchType } from "./abodePhotos";
import { hasPdfSignature } from "./abodeDeliveryNotes";
import { abodeReferenceContentType } from "@shared/abodeReferenceFiles";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;
export const SAMPLE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const sampleSignatureMatches = (bytes: Buffer, type: string) =>
  type === "application/pdf" ? hasPdfSignature(bytes) : photoBytesMatchType(bytes, type);

export const latestStockingSample = async (tx: Tx, lineItemId: string) =>
  (await tx.select().from(stockingSamples).where(eq(stockingSamples.lineItemId, lineItemId)).orderBy(desc(stockingSamples.version)).limit(1))[0];

export async function requireStockingSampleApproval(tx: Tx, lineItemId: string) {
  const latest = await latestStockingSample(tx, lineItemId);
  if (latest?.status !== "approved") throw new Error("The customer must approve this stocking's latest digital sample before production can be recorded or completed.");
  return latest;
}

export async function requireStockingDispatchApproval(jobId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(71024002)`);
    const items = await tx.select().from(jobLineItems).where(eq(jobLineItems.jobId, jobId));
    for (const item of items) {
      const latest = await latestStockingSample(tx, item.id);
      // Previously produced items without a sample are historical, not new work.
      if (latest ? latest.status !== "approved" : !item.completed) {
        throw new Error("Every stocking must have its latest digital sample approved before dispatch.");
      }
    }
  });
}

export const sampleUploadBody: RequestHandler = (req, res, next) => {
  raw({ type: [...SAMPLE_TYPES], limit: MAX_SAMPLE_BYTES })(req, res, error => {
    if (error) return void res.status(error.status === 413 ? 413 : 400).json({ error: "Choose a JPEG, PNG, WebP or PDF up to 10 MB" });
    next();
  });
};

export function registerAbodeSampleRoutes(app: Express, deps: {
  base: string; auth: RequestHandler; customerMode: boolean;
  wrap: (handler: (req: any, res: any, customer: any) => Promise<any>) => RequestHandler;
  owned: (jobId: string, customer: any) => Promise<{ order: any; job: any }>;
}) {
  const { base, auth, wrap, owned, customerMode } = deps;
  const path = `${base}/orders/:id/items/:itemId/samples`;
  const ownedItem = async (req: any, customer: any) => {
    const { job } = await owned(req.params.id, customer);
    const [item] = await db.select().from(jobLineItems).where(and(eq(jobLineItems.id, req.params.itemId), eq(jobLineItems.jobId, job.id)));
    if (!item?.stockingDetails) throw new Error("Stocking not found on this order");
    return { job, item };
  };
  const assertEditable = (job: any, item: any) => {
    if (item.completed || job.completed || job.dhlTrackingNumber || !["pending", "ready", "draft"].includes(job.invoiceStatus)) {
      throw new Error("Samples cannot be changed after this stocking has been produced, dispatched or invoiced.");
    }
  };
  app.get(`${path}/:sampleId/file`, auth, wrap(async (req, res, customer) => {
    const { item } = await ownedItem(req, customer);
    const [sample] = await db.select().from(stockingSamples).where(and(eq(stockingSamples.id, req.params.sampleId), eq(stockingSamples.lineItemId, item.id)));
    if (!sample) return res.status(404).json({ error: "Digital sample not found" });
    const file = await new ObjectStorageService().getObjectEntityFile(sample.fileUrl);
    const [metadata] = await file.getMetadata();
    res.set({
      "Content-Type": sample.fileType, "Content-Length": String(metadata.size),
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(sample.fileName).replace(/'/g, "%27")}`,
    });
    await pipeline(file.createReadStream(), res);
  }));
  if (customerMode) {
    app.post(`${path}/:sampleId/decision`, auth, wrap(async (req, res, customer) => {
      if (req.session.impersonationStaffUserId || req.session.impersonationCustomerUserId) {
        return res.status(403).json({ error: "Digital samples must be approved by the customer using their own login, not staff viewing their portal." });
      }
      const { decision, notes } = z.object({
        decision: z.enum(["approved", "amends_required"]), notes: z.string().trim().max(2000).optional(),
      }).refine(data => data.decision !== "amends_required" || Boolean(data.notes), "Describe the changes required").parse(req.body);
      await ownedItem(req, customer);
      const result = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(71024002)`);
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, req.params.id)).for("update");
        const [item] = await tx.select().from(jobLineItems).where(eq(jobLineItems.id, req.params.itemId)).for("update");
        if (!job || job.customerId !== customer.id || !item || item.jobId !== job.id) throw new Error("Stocking not found");
        const latest = await latestStockingSample(tx, item.id);
        if (!latest || latest.id !== req.params.sampleId) throw new Error("A newer digital sample is available. Refresh and review the latest version.");
        if (latest.status === decision && (decision === "approved" || latest.customerNotes === notes)) return latest;
        assertEditable(job, item);
        if (latest.status !== "pending_approval") throw new Error("This sample already has a decision. Ask staff to upload a revision if changes are needed.");
        const now = new Date();
        const [saved] = await tx.update(stockingSamples).set({
          status: decision, customerNotes: notes || null,
          decidedByCustomerUserId: req.session.customerUserId, decidedAt: now,
        }).where(eq(stockingSamples.id, latest.id)).returning();
        await tx.update(jobLineItems).set({
          logoApproved: decision === "approved", logoApprovedAt: decision === "approved" ? now : null,
        }).where(eq(jobLineItems.id, item.id));
        return saved;
      });
      res.json({ success: true, status: result.status });
    }));
    return;
  }
  app.post(`${path}/upload`, auth, sampleUploadBody, wrap(async (req, res, customer) => {
    const { job, item } = await ownedItem(req, customer);
    assertEditable(job, item);
    const type = req.get("content-type")?.split(";")[0] || "";
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > MAX_SAMPLE_BYTES || !sampleSignatureMatches(req.body, type)) {
      return res.status(400).json({ error: "Choose a valid JPEG, PNG, WebP or PDF up to 10 MB" });
    }
    res.json({ key: await new ObjectStorageService().saveSmallObject(req.body, type) });
  }));
  app.post(path, auth, wrap(async (req, res, customer) => {
    await ownedItem(req, customer);
    const { objectKey, fileName } = z.object({
      objectKey: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i), fileName: z.string().trim().min(1).max(200),
    }).parse(req.body);
    const file = await new ObjectStorageService().getObjectEntityFile(objectKey);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isFinite(size) || size <= 0) throw new Error("The uploaded sample is empty. Choose the PDF printout or an image and upload it again.");
    if (size > MAX_SAMPLE_BYTES) throw new Error("This sample is larger than 10 MB. Choose a smaller PDF or image.");
    const [bytes] = await file.download({ start: 0, end: 11 });
    const type = abodeReferenceContentType(bytes);
    if (!type) throw new Error("This file is not a readable PDF, JPEG, PNG or WebP. EMB files need embroidery software; upload the PDF printout for customer approval.");
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(71024002)`);
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, req.params.id)).for("update");
      const [item] = await tx.select().from(jobLineItems).where(eq(jobLineItems.id, req.params.itemId)).for("update");
      if (!job || job.customerId !== customer.id || !item || item.jobId !== job.id) throw new Error("Stocking not found");
      assertEditable(job, item);
      const latest = await latestStockingSample(tx, item.id);
      const [priorUpload] = await tx.select().from(stockingSamples).where(and(eq(stockingSamples.lineItemId, item.id), eq(stockingSamples.fileUrl, objectKey)));
      if (priorUpload) return priorUpload; // A retry must never resurrect an old revision.
      const [production] = await tx.select({ id: productionEntries.id }).from(productionEntries).where(eq(productionEntries.lineItemId, item.id)).limit(1);
      if (production) throw new Error("This stocking already has production recorded. Its approved sample cannot be replaced.");
      const [sample] = await tx.insert(stockingSamples).values({
        lineItemId: item.id, version: (latest?.version || 0) + 1, fileName, fileUrl: objectKey,
        fileType: type, fileSize: size, uploadedById: req.session.userId,
      }).returning();
      await tx.update(jobLineItems).set({ logoApproved: false, logoApprovedAt: null }).where(eq(jobLineItems.id, item.id));
      return sample;
    });
    res.json({ id: result.id, version: result.version, status: result.status });
  }));
}
