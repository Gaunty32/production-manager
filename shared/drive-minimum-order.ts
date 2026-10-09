import { billedQuantityForMatchingLine, calculateJobPrice, type PricingTable } from "./pricing";

export interface MinimumOrderComparison {
  actualQuantity: number;
  billedQuantity: number;
  actualTotal: number;
  billedTotal: number;
}

type PricingLine = { quantity: number; stitchCount: number; jobType?: string };
const cents = (amount: number) => Math.round(amount * 100);

/** Use the invoice's own grouped quantities and unit prices, not a guessed uplift. */
export function getMinimumOrderComparison(
  lineItems: PricingLine[],
  pricingTable: PricingTable,
  invoiceTotal: number | string | null,
  now: Date = new Date(),
): MinimumOrderComparison | null {
  if (typeof invoiceTotal !== "number" || !Number.isFinite(invoiceTotal) || !lineItems.length) return null;
  if (lineItems.some(line => !Number.isInteger(line.quantity) || line.quantity <= 0)) return null;
  const pricing = calculateJobPrice(lineItems, pricingTable, now);
  if (typeof pricing.totalPrice !== "number" || cents(pricing.totalPrice) !== cents(invoiceTotal)) return null;
  let actualTotal = 0;
  let actualQuantity = 0;
  let billedQuantity = 0;
  for (let index = 0; index < lineItems.length; index++) {
    const line = lineItems[index];
    const unitPrice = pricing.lineItemPrices[index].unitPrice;
    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice)) return null;
    actualTotal += unitPrice * line.quantity;
    actualQuantity += line.quantity;
    billedQuantity += billedQuantityForMatchingLine(lineItems, index, now);
  }
  if (billedQuantity <= actualQuantity) return null;
  return {
    actualQuantity,
    billedQuantity,
    actualTotal: cents(actualTotal) / 100,
    billedTotal: pricing.totalPrice,
  };
}

/** Only explain a name-matched job when both its actual quantity AND value agree. */
export function isMinimumOrderDifference(
  comparison: MinimumOrderComparison | null | undefined,
  driveRows: Array<{ quantity: string }>,
  invoiceTotal: number,
  driveTotal: number,
): comparison is MinimumOrderComparison {
  if (!comparison || !driveRows.length) return false;
  let driveQuantity = 0;
  for (const row of driveRows) {
    const quantity = row.quantity.trim().replace(/,/g, "");
    if (!/^\d+(?:\.0+)?$/.test(quantity) || Number(quantity) <= 0) return false;
    driveQuantity += Number(quantity);
  }
  return driveQuantity === comparison.actualQuantity
    && comparison.billedQuantity > comparison.actualQuantity
    && cents(invoiceTotal) === cents(comparison.billedTotal)
    && Math.abs(cents(driveTotal) - cents(comparison.actualTotal)) <= 1
    && cents(invoiceTotal) - cents(driveTotal) > 1;
}
