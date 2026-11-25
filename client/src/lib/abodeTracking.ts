import { apiRequest } from "./queryClient";

export type AbodeTrackingCarrier = "dpd" | "royal_mail" | "inpost";

/** Record an existing consignment only; do not recover a label or buy shipping. */
export async function saveExistingAbodeTracking(orderNumber: string, trackingNumber: string, carrier?: AbodeTrackingCarrier) {
  const response = await apiRequest("POST", "/api/abode/tracking/import", {
    entries: [{ orderNumber, trackingNumber: trackingNumber.trim(), ...(carrier ? { carrier } : {}) }],
  });
  return response.json();
}
