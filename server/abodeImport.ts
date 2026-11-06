import { createHash } from "node:crypto";
import { z } from "zod";
import { stockingShippingRoute, type StockingDetails, type StockingRecipient } from "../shared/abode";

const rowsSchema = z.array(z.record(z.union([z.string(), z.number(), z.null()]))).min(1).max(5000);
export type StockingImportOrder = {
  orderNumber: string; recipient: StockingRecipient; items: StockingDetails[];
  shippingRoute: "dpd" | "royal_mail"; importHash: string;
};
export function parseStockingRows(input: unknown): StockingImportOrder[] {
  const rows = rowsSchema.parse(input);
  const orders = new Map<string, StockingImportOrder>();
  const cell = (row: Record<string, unknown>, key: string, rowNumber: number, required = true, preserve = false) => {
    const raw = String(row[key] ?? "");
    const value = preserve ? raw : raw.trim();
    if ((required && !value.trim()) || value.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      throw new Error(`Row ${rowNumber}: ${key} is missing or invalid`);
    }
    return value;
  };
  rows.forEach((rawRow, index) => {
    const row = Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [key.replace(/^\uFEFF/, "").trim(), value]));
    const n = index + 2;
    const orderNumber = cell(row, "Order number", n);
    if (orderNumber.length > 80) throw new Error(`Row ${n}: order number is too long`);
    const recipient: StockingRecipient = {
      name: cell(row, "Delivery name", n), line1: cell(row, "Address line 1", n),
      line2: cell(row, "Address line 2", n, false), town: cell(row, "Town", n),
      county: cell(row, "County", n, false), postcode: cell(row, "Postcode", n).toUpperCase(),
    };
    const item = {
      colour: cell(row, "Stocking colour", n), font: cell(row, "Font", n),
      thread: cell(row, "Thread colour", n), name: cell(row, "Name", n, true, true),
    };
    const existing = orders.get(orderNumber);
    if (existing && JSON.stringify(existing.recipient) !== JSON.stringify(recipient)) {
      throw new Error(`Row ${n}: order ${orderNumber} has conflicting delivery addresses`);
    }
    if (existing) existing.items.push(item);
    else orders.set(orderNumber, { orderNumber, recipient, items: [item], shippingRoute: stockingShippingRoute(recipient.postcode), importHash: "" });
  });
  return Array.from(orders.values()).map(order => ({
    ...order, importHash: createHash("sha256").update(JSON.stringify({
      recipient: order.recipient,
      // Reordering an otherwise identical spreadsheet is a harmless retry.
      items: order.items.map(item => JSON.stringify(item)).sort(),
    })).digest("hex"),
  }));
}
