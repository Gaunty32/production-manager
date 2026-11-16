import type { Express, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { jobs, stockingOrders } from "@shared/schema";
import { isAbodeCustomer } from "@shared/abode";

/** Save staff-supplied consignment numbers only; never book, email or infer delivery. */
export function registerAbodeTrackingImport(app: Express, staffAuth: RequestHandler) {
  app.post("/api/abode/tracking/import", staffAuth, async (req, res) => {
    try {
      const input = z.object({
        entries: z.array(z.object({
          orderNumber: z.string().trim().regex(/^[A-Za-z0-9-]{1,80}$/),
          trackingNumber: z.string().trim().regex(/^\d{10}$/),
        })).min(1).max(100),
      }).parse(req.body);
      if (new Set(input.entries.map(row => row.orderNumber)).size !== input.entries.length ||
          new Set(input.entries.map(row => row.trackingNumber)).size !== input.entries.length) {
        throw new Error("Each order and DPD consignment number must appear only once");
      }
      const customer = (await storage.getCustomers()).find(isAbodeCustomer);
      if (!customer) throw new Error("Abode customer not found");
      await db.transaction(async tx => {
        // Lock in a stable order, including the order rows used by label recovery.
        const existing = await tx.select({ order: stockingOrders, job: jobs })
          .from(stockingOrders).innerJoin(jobs, eq(jobs.id, stockingOrders.jobId))
          .where(and(eq(stockingOrders.customerId, customer.id), eq(jobs.customerId, customer.id)))
          .orderBy(jobs.id).for("update");
        for (const entry of input.entries) {
          const target = existing.find(row => row.order.orderNumber === entry.orderNumber);
          if (!target || target.order.shippingRoute !== "dpd") throw new Error(`DPD order ${entry.orderNumber} not found`);
          if (!target.order.dispatchedAt && !target.order.bookedAt && !target.order.deliveredAt) {
            throw new Error(`Confirm despatch for order ${entry.orderNumber} before adding tracking`);
          }
          if (target.job.dhlTrackingNumber && target.job.dhlTrackingNumber !== entry.trackingNumber) {
            throw new Error(`Order ${entry.orderNumber} already has a different tracking number; nothing was changed`);
          }
          if (existing.some(row => row.job.id !== target.job.id && row.job.dhlTrackingNumber === entry.trackingNumber)) {
            throw new Error(`DPD number ${entry.trackingNumber} is already saved against another order`);
          }
        }
        for (const entry of input.entries) {
          const target = existing.find(row => row.order.orderNumber === entry.orderNumber)!;
          if (target.job.dhlTrackingNumber === entry.trackingNumber) continue;
          await tx.update(jobs).set({ dhlTrackingNumber: entry.trackingNumber, shippingCarrier: "dpd" })
            .where(eq(jobs.id, target.job.id));
          await tx.update(stockingOrders).set({ trackingCheckedAt: null, trackingError: null })
            .where(eq(stockingOrders.jobId, target.job.id));
        }
      });
      res.json({ saved: input.entries.length });
    } catch (error) {
      res.status(409).json({ error: error instanceof z.ZodError
        ? "Enter an order number and a 10-digit DPD consignment number on each line"
        : error instanceof Error ? error.message : "Could not save tracking numbers" });
    }
  });
}
