import { raw, type Express, type RequestHandler } from "express";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { jobLineItems, stockingSamples } from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";

// Still shared by finished-product photo uploads.
export const sampleUploadBody: RequestHandler = (req, res, next) => {
  raw({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], limit: 10 * 1024 * 1024 })(req, res, error => {
    if (error) return void res.status(error.status === 413 ? 413 : 400).json({ error: "Choose a JPEG, PNG, WebP or PDF up to 10 MB" });
    next();
  });
};

// Retain authorised access to historical files, but never let an old browser
// reintroduce approval holds or create new samples.
export function registerAbodeSampleRoutes(app: Express, deps: {
  base: string; auth: RequestHandler; customerMode: boolean;
  wrap: (handler: (req: any, res: any, customer: any) => Promise<any>) => RequestHandler;
  owned: (jobId: string, customer: any) => Promise<{ order: any; job: any }>;
}) {
  const { base, auth, wrap, owned } = deps;
  const path = `${base}/orders/:id/items/:itemId/samples`;
  const ownedItem = async (req: any, customer: any) => {
    const { job } = await owned(req.params.id, customer);
    const [item] = await db.select().from(jobLineItems).where(and(eq(jobLineItems.id, req.params.itemId), eq(jobLineItems.jobId, job.id)));
    if (!item?.stockingDetails) throw new Error("Stocking not found on this order");
    return item;
  };
  app.get(`${path}/:sampleId/file`, auth, wrap(async (req, res, customer) => {
    const item = await ownedItem(req, customer);
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
  app.post([path, `${path}/*`], auth, wrap(async (req, res, customer) => {
    await ownedItem(req, customer);
    res.status(409).json({ error: "Abode orders no longer use digital samples or customer approval. Upload a finished-product photograph instead." });
  }));
}
