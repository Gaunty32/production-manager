import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { jobs, stockingOrders } from "@shared/schema";
import { ABODE_CARRIAGE, ABODE_DEFAULT_WEIGHT_GRAMS, ABODE_NETWORK_CODE, stockingDispatchedAt } from "@shared/abode";
import { dpdService } from "./dpd";
export const abodeDispatchedAt = stockingDispatchedAt;

export async function bookAbodeLabel(jobId: string, confirmNoExistingBooking = false) {
  const [order] = await db.select().from(stockingOrders).where(eq(stockingOrders.jobId, jobId));
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!order || !job) throw new Error("Order not found");
  if (order.shippingRoute !== "dpd") throw new Error("Book this address through Parcel2Go using Royal Mail");
  if (job.dhlTrackingNumber) throw new Error("This order already has tracking. Print its saved label; do not book twice.");
  if (order.shipmentId || order.labelHtml || order.bookedAt || order.parcelNumbers?.length) {
    throw new Error("This order has saved booking details. Recover its existing label; do not book twice.");
  }
  if (!["pending", "ready", "draft"].includes(job.invoiceStatus)) throw new Error("This order has already been invoiced");
  if (!dpdService.isConfigured()) throw new Error("DPD booking is not configured");
  const claimed = await db.update(stockingOrders).set({ shipmentState: "booking" }).where(and(
    eq(stockingOrders.jobId, jobId), eq(stockingOrders.shipmentState, confirmNoExistingBooking ? "review" : "unbooked"),
    isNull(stockingOrders.shipmentId), isNull(stockingOrders.labelHtml), isNull(stockingOrders.bookedAt),
  )).returning();
  if (!claimed.length) throw new Error("A booking has already been attempted. Check DPD and recover the existing shipment; do not rebook.");
  let result;
  try {
    const r = order.recipient;
    result = await dpdService.createShipment({
      deferLabelFetch: true,
      recipient: { name: r.name, street: r.line1, locality: r.line2, city: r.town, zipCode: r.postcode, country: "GB" },
      parcels: [{ weight: ABODE_DEFAULT_WEIGHT_GRAMS, customerReference: order.orderNumber }],
      reference: order.orderNumber, networkCode: ABODE_NETWORK_CODE,
    });
  } catch (error) {
    console.error(`[Abode] DPD booking failed for job ${jobId}:`, error instanceof Error ? error.message : "Courier error");
    await db.update(stockingOrders).set({ shipmentState: "review" }).where(eq(stockingOrders.jobId, jobId));
    throw new Error("DPD booking needs review. Check your DPD account before doing anything else; do not rebook.");
  }
  try {
    const now = new Date();
    await db.transaction(async tx => {
      await tx.update(stockingOrders).set({
        shipmentState: "booked", labelHtml: result.labelHtml, shipmentId: result.shipmentJobId || null,
        parcelNumbers: result.parcelNumbers, bookedAt: now, trackingStatus: "Label created — awaiting despatch",
      }).where(eq(stockingOrders.jobId, jobId));
      await tx.update(jobs).set({
        dhlTrackingNumber: result.trackingNumber, shippingCost: String(ABODE_CARRIAGE),
        shippingMethod: "direct_delivery", packageType: "bags", packageCount: 1,
      }).where(eq(jobs.id, jobId));
    });
  } catch (error) {
    console.error(`[Abode] Could not save booked shipment for job ${jobId}, shipment ${result.shipmentJobId}, tracking ${result.trackingNumber}:`, error instanceof Error ? error.message : "Database error");
    // Never buy another shipment when the remote purchase may have succeeded.
    return { ...result, warning: "DPD booked this parcel but saving failed. Keep this tracking number and label, then recover the booking. Do not book again." };
  }
  // Tracking and the shipment ID are already durable if label retrieval is slow
  // or interrupted. Fetching/printing can safely be retried without repurchasing.
  if (!result.labelHtml && result.shipmentJobId) {
    const label = await dpdService.fetchLabel(result.shipmentJobId);
    if (label) {
      result.labelHtml = label;
      try {
        await db.update(stockingOrders).set({ labelHtml: label }).where(eq(stockingOrders.jobId, jobId));
      } catch (error) {
        console.error(`[Abode] Could not cache label for booked job ${jobId}:`, error instanceof Error ? error.message : "Database error");
      }
    }
  }
  return result;
}

// Shared guard also protects generic completion/notification paths.
export async function hasUndespatchedAbodeOrder(jobIds: string[]): Promise<boolean> {
  if (!jobIds.length) return false;
  const rows = await db.select({ order: stockingOrders, job: jobs }).from(stockingOrders)
    .innerJoin(jobs, eq(jobs.id, stockingOrders.jobId))
    .where(inArray(stockingOrders.jobId, jobIds));
  return rows.some(({ order, job }) => !abodeDispatchedAt(order, job));
}
