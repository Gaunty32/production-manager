import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { jobs, jobLineItems, stockingOrders, stockingProduction, type JobLineItem } from "@shared/schema";
import { stockingRate } from "@shared/abode";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function priceCompletedStocking(tx: Tx, item: JobLineItem, customerId: string): Promise<number> {
  // Every completion path shares this database lock, including normal queues.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(71024002)`);
  const [prior] = await tx.select().from(stockingProduction).where(eq(stockingProduction.lineItemId, item.id));
  if (prior) return prior.unitPrice;
  const [total] = await tx.select({ count: sql<number>`count(*)::int` }).from(stockingProduction)
    .where(eq(stockingProduction.customerId, customerId));
  const unitPrice = stockingRate(total.count);
  await tx.insert(stockingProduction).values({ lineItemId: item.id, customerId, unitPrice });
  return unitPrice;
}

export async function updateStockingLine(id: string, updates: Partial<JobLineItem>): Promise<JobLineItem | null> {
  const [existing] = await db.select().from(jobLineItems).where(eq(jobLineItems.id, id));
  if (!existing?.stockingDetails) return null;
  if (updates.quantity !== undefined && updates.quantity !== 1) throw new Error("Each imported stocking must remain a separate single item");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(71024002)`);
    const [item] = await tx.select().from(jobLineItems).where(eq(jobLineItems.id, id)).for("update");
    const [order] = await tx.select().from(stockingOrders).where(eq(stockingOrders.jobId, item.jobId));
    if (!order) throw new Error("Stocking order is missing");
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, item.jobId));
    if (!["pending", "ready", "draft"].includes(job.invoiceStatus)) throw new Error("Invoiced stocking production cannot be changed");
    const agreedUnitPrice = updates.completed === true ? await priceCompletedStocking(tx, item, order.customerId) : item.agreedUnitPrice;
    // Imported personalisation and agreed prices cannot be overwritten by the
    // generic job editor. The production instructions remain the sheet's text.
    const [saved] = await tx.update(jobLineItems).set({
      ...updates, stockingDetails: item.stockingDetails, description: item.description,
      agreedUnitPrice,
      ...(updates.completed === true ? {
        completedAt: updates.completedAt ? new Date(updates.completedAt) : item.completedAt || new Date(),
      } : updates.completed === false ? { completedAt: null } : {}),
      ...(updates.logoApproved === true ? { logoApprovedAt: item.logoApprovedAt || new Date() } : {}),
      ...(updates.logoApproved === false ? { logoApprovedAt: null } : {}),
    }).where(eq(jobLineItems.id, id)).returning();
    return saved;
  });
}

export async function completeStockingOrder(jobId: string, staffId: string | null) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(71024002)`);
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job || !["pending", "ready", "draft"].includes(job.invoiceStatus)) throw new Error("This order cannot be completed");
    const items = await tx.select().from(jobLineItems).where(eq(jobLineItems.jobId, jobId));
    if (!items.length || items.some(item => !item.stockingDetails || item.quantity !== 1)) throw new Error("Review this imported order's stocking items before completing it");
    for (const item of items.filter(item => item.stockingDetails && !item.completed)) {
      const agreedUnitPrice = await priceCompletedStocking(tx, item, job.customerId);
      await tx.update(jobLineItems).set({
        completed: true, completedAt: new Date(), completedById: staffId, agreedUnitPrice,
      }).where(eq(jobLineItems.id, item.id));
    }
    await tx.update(jobs).set({
      completed: true, status: "completed", invoiceStatus: "ready",
      conversationArchivedByStaff: true,
    }).where(and(eq(jobs.id, jobId), eq(jobs.customerId, job.customerId)));
  });
}
