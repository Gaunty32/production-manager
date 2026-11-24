import { apiRequest } from "./queryClient";

/** Record an existing consignment only; do not recover a label or buy shipping. */
export async function saveExistingAbodeTracking(orderNumber: string, trackingNumber: string) {
  const response = await apiRequest("POST", "/api/abode/tracking/import", {
    entries: [{ orderNumber, trackingNumber: trackingNumber.trim() }],
  });
  return response.json();
}
