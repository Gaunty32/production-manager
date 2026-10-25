import { eq, inArray, asc } from "drizzle-orm";
import { jobs } from "@shared/schema";
import { calculateShippingCost } from "@shared/pricing";
import { db } from "./db";
import type { BookedDpdDetails } from "@shared/shipping-details";

export function buildBookedDpdDetails(
  count: number, type: "box" | "bag" | "boxes" | "bags", method: "direct_delivery" | "consolidated",
  shipmentId: string | null,
): BookedDpdDetails {
  const packageType = type === "bag" || type === "bags" ? "bags" : "boxes";
  const cost = calculateShippingCost(packageType, count);
  return { shippingMethod: method, packageCount: count, packageType, shippingCost: String(cost.cost), consolidatedShipmentId: shipmentId };
}

// Persist all members together. Never rewrite issued-invoice carriage details,
// and never mark unfinished production complete merely because a label exists.
export async function saveBookedDpdDetails(ids: string[], trackingNumber: string, details: BookedDpdDetails) {
  return db.transaction(async tx => {
    const members = await tx.select().from(jobs).where(inArray(jobs.id, ids)).orderBy(asc(jobs.id)).for("update");
    if (members.length !== ids.length) throw new Error("One or more booked orders no longer exist");
    const editable = members.filter(job => ["pending", "ready", "draft"].includes(job.invoiceStatus));
    const primaryId = ids.find(id => editable.some(job => job.id === id));
    for (const job of members) {
      const canSaveBilling = editable.some(member => member.id === job.id);
      await tx.update(jobs).set({
        dhlTrackingNumber: trackingNumber.trim(),
        ...(canSaveBilling ? { ...details, shippingCost: job.id === primaryId ? details.shippingCost : null } : {}),
        ...(job.completed && !job.dispatchEmailSentAt && !job.dispatchEmailQueuedAt ? { dispatchEmailQueuedAt: new Date() } : {}),
      }).where(eq(jobs.id, job.id));
    }
    return { billingSaved: editable.length === members.length };
  });
}
