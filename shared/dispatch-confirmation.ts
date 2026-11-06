// Intentionally limited to the agreed Merox trial, not enabled by company name.
export const MEROX_DISPATCH_CUSTOMER_ID = "810c3089-0057-4dc2-abd0-43ce77e13309";

export function canShareDispatchConfirmation(job: {
  customerId: string;
  completed: boolean;
  status?: string;
  dhlTrackingNumber?: string | null;
  shippingMethod?: string | null;
}): boolean {
  return job.customerId === MEROX_DISPATCH_CUSTOMER_ID &&
    job.completed &&
    job.status !== "cancelled" &&
    job.status !== "pending_customer_approval" &&
    Boolean(job.dhlTrackingNumber?.trim()) &&
    // These are billing/fulfilment methods, not courier names.
    (!job.shippingMethod || ["direct_delivery", "consolidated"].includes(job.shippingMethod) || /^dpd\b/i.test(job.shippingMethod));
}
