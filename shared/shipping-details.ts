import { z } from "zod";

export const dpdParcelSchema = z.object({
  packageCount: z.coerce.number().int().min(1).max(50),
  packageType: z.enum(["box", "bag", "boxes", "bags"]),
  shippingMethod: z.enum(["direct_delivery", "consolidated"]).optional(),
});

export type BookedDpdDetails = {
  shippingMethod: "direct_delivery" | "consolidated";
  packageCount: number;
  packageType: "boxes" | "bags";
  shippingCost: string;
  consolidatedShipmentId: string | null;
};

type ShippingJob = {
  id: string;
  jobName: string;
  customerId: string;
  invoiceStatus: string;
  shippingMethod?: string | null;
  requestedShippingMethod?: string | null;
  shippingCost?: string | null;
  dhlTrackingNumber?: string | null;
  packageCount?: number | null;
  packageType?: string | null;
  consolidatedShipmentId?: string | null;
};

export type ShippingIssue = { jobId: string; jobName: string; reasons: string[] };

// A customer-supplied label is not our courier service, even if an older
// dispatch screen recorded it as direct delivery with an automatic tariff.
export function isCustomerProvidedLabel(job: {
  requestedShippingMethod?: string | null;
  shippingMethod?: string | null;
}): boolean {
  return job.requestedShippingMethod === "courier_label_provided"
    || job.shippingMethod === "courier_label_provided";
}

export function customerLabelShippingUpdates(
  job: ShippingJob, updates: Partial<ShippingJob>,
): Partial<ShippingJob> {
  if (!isCustomerProvidedLabel({ ...job, ...updates })) return updates;
  return {
    ...updates, shippingMethod: "courier_label_provided",
    shippingCost: "0", consolidatedShipmentId: null,
  };
}

// Check the actual shipment, not the customer's requested delivery option.
// A charge on an already-invoiced sibling must not be billed a second time.
export function getShippingIssues(
  selected: ShippingJob[], allJobs: ShippingJob[] = selected, manualCosts: Record<string, string | number> = {},
): ShippingIssue[] {
  const selectedIds = new Set(selected.map(job => job.id));
  return selected.flatMap(job => {
    // Tracking may be recorded, but is not required to bill our production.
    // Carriage generation separately excludes these orders, including TBA.
    if (isCustomerProvidedLabel(job)) return [];
    const delivery = allJobs.filter(other => other.customerId === job.customerId && (
      other.id === job.id ||
      (!!job.dhlTrackingNumber && other.dhlTrackingNumber === job.dhlTrackingNumber) ||
      (!!job.consolidatedShipmentId && other.consolidatedShipmentId === job.consolidatedShipmentId)
    ));
    const method = job.shippingMethod || delivery.find(other => other.shippingMethod)?.shippingMethod;
    const reasons: string[] = [];
    if (!method) reasons.push("Dispatch method has not been recorded.");
    if (method !== "customer_collection" && method !== "free_local") {
      if (!delivery.some(other => other.dhlTrackingNumber?.trim())) reasons.push("No tracking number is recorded.");
      if (!delivery.some(other => Number.isInteger(other.packageCount) && (other.packageCount ?? 0) > 0
        && ["boxes", "bags", "box", "bag"].includes(other.packageType || ""))) {
        reasons.push("Parcel count and type are missing.");
      }
      const billedOrSelected = delivery.filter(other => !isCustomerProvidedLabel(other)
        && (selectedIds.has(other.id) || ["invoiced", "paid"].includes(other.invoiceStatus)));
      const hasCost = billedOrSelected.some(other => {
        const cost = other.shippingCost === "TBA" ? manualCosts[other.id] : other.shippingCost;
        return cost !== null && cost !== undefined && String(cost).trim() !== "" && Number.isFinite(Number(cost)) && Number(cost) >= 0;
      });
      if (!hasCost) reasons.push("Carriage charge is missing or needs confirming.");
    }
    return reasons.length ? [{ jobId: job.id, jobName: job.jobName, reasons }] : [];
  });
}
