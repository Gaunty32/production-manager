import { z } from "zod";

export const invoiceQuantitySchema = z.number().int().min(1).max(2147483647);
export const invoiceQuantitiesSchema = z.record(invoiceQuantitySchema);

export function applyInvoiceQuantities<T extends { lineItemId?: string; quantity: number }>(
  lines: T[], quantities: Record<string, number>,
): T[] {
  return lines.map(line => line.lineItemId && quantities[line.lineItemId] !== undefined
    ? { ...line, quantity: invoiceQuantitySchema.parse(quantities[line.lineItemId]) }
    : line);
}
