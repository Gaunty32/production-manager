export const CUSTOMER_SHIPPING_OPTIONS = [
  { value: "dpd", label: "Ship with DPD" },
  { value: "customer_collection", label: "Customer collection" },
  { value: "local_delivery", label: "Local delivery (within 15 miles of LS13)" },
  { value: "courier_label_provided", label: "Courier Label Provided" },
] as const;

export function getCustomerShippingOptionLabel(value: string | null | undefined): string {
  return CUSTOMER_SHIPPING_OPTIONS.find(option => option.value === value)?.label || "Not specified";
}