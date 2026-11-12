export const ABODE_CUSTOMER_NAME = "Abode Home & Gifts";
export const ABODE_CARRIAGE = 5.50;
export const ABODE_DEFAULT_WEIGHT_GRAMS = 4000;
export const ABODE_NETWORK_CODE = "2^32"; // Expresspak 5 Next Day
const STOCKING_FONT_NAMES: Record<string, string> = {
  "1": "Sad Night Script Regular",
  "2": "Tabac G3 Semibold",
  "3": "Stolen Times Italic",
};

// Display-only mapping: keep the original spreadsheet values intact.
export function stockingFontLabel(font: string): string {
  const number = /^(?:font\s*)?([1-3])$/i.exec(font.trim())?.[1];
  return number ? `Font ${number} — ${STOCKING_FONT_NAMES[number]}` : font;
}

export function isAbodeCustomer(customer: { name: string } | null | undefined): boolean {
  return customer?.name.trim().toLowerCase() === ABODE_CUSTOMER_NAME.toLowerCase();
}
export function stockingRate(completedCount: number): number {
  return completedCount >= 100 ? 5 : 7;
}
// Verified against DPD Local's authenticated, read-only shipping/network
// catalogue: these are bag products, NOT Parcel Next Day (2^12).
export function stockingBagNetworkCode(weightGrams: number): string {
  if (!Number.isInteger(weightGrams) || weightGrams < 100 || weightGrams > 5000) {
    throw new Error("A DPD Expresspak bag must weigh between 100g and 5kg");
  }
  return weightGrams <= 1000 ? "2^68" : "2^32";
}
export type StockingDetails = { colour: string; font: string; thread: string; name: string };
/** Only actual despatch/delivery moves an order out of production. */
export function splitStockingRegister<T extends {
  dispatchedAt?: string | Date | null;
  deliveredAt?: string | Date | null;
}>(orders: readonly T[]): { awaitingProduction: T[]; despatched: T[] } {
  const awaitingProduction: T[] = [];
  const despatched: T[] = [];
  for (const order of orders) {
    (order.dispatchedAt || order.deliveredAt ? despatched : awaitingProduction).push(order);
  }
  return { awaitingProduction, despatched };
}

/** Stocking imports are worked in their own section, not the main queue. */
export function isStockingWorkflowJob(job: {
  lineItems?: readonly { stockingDetails?: StockingDetails | null }[] | null;
}): boolean {
  return job.lineItems?.some(item => Boolean(item.stockingDetails)) ?? false;
}

export type StockingRecipient = { name: string; line1: string; line2: string; town: string; county: string; postcode: string };

// Conservative UK remote-area routing: anything uncertain goes to staff/Royal
// Mail rather than purchasing a non-standard DPD service. Central-belt Scotland
// is not excluded merely for being in Scotland.
export function stockingShippingRoute(postcode: string): "dpd" | "royal_mail" {
  const code = postcode.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(code)) return "royal_mail";
  const outward = code.slice(0, -3);
  if (/^(BT|IM|JE|GY|HS|ZE|IV|KW)/.test(outward)) return "royal_mail";
  if (/^KA(27|28)$/.test(outward) || /^PA(2[0-9]|[3-8]\d)$/.test(outward)
    || /^PH(1[5-9]|[2-5]\d)$/.test(outward) || /^FK(1[7-9]|2[01])$/.test(outward)
    || /^AB(3[1-8]|4[1-9]|5[0-6])$/.test(outward) || /^PO(3[0-9]|4[01])$/.test(outward)
    || /^TR2[1-5]$/.test(outward)) return "royal_mail";
  return "dpd";
}
