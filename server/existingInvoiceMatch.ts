import type { Job, JobLineItem, Customer } from "@shared/schema";
import { billedQuantityForMatchingLine, calculateJobPrice } from "@shared/pricing";

const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const pennies = (value: number) => Math.round(value * 100);
const jobLabel = (job: Job) => job.poNumber ? `${job.jobName} (PO: ${job.poNumber})` : job.jobName;

/** Deliberately conservative: ambiguous/unsupported invoices are never auto-linked. */
export function matchExistingInvoice(
  invoice: any, customer: Customer, jobs: Job[], items: JobLineItem[], quantities: Record<string, number> = {},
) {
  if (invoice.Type !== "ACCREC" || !["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"].includes(invoice.Status)) {
    throw new Error("Only a valid sales invoice can be linked; voided and deleted invoices are excluded");
  }
  if (invoice.LineAmountTypes !== "Exclusive" || invoice.CurrencyCode !== "GBP") {
    throw new Error("Automatic linking currently requires a GBP invoice with VAT-exclusive line amounts");
  }
  if (!Array.isArray(invoice.LineItems) || !invoice.LineItems.length) throw new Error("Xero did not return the invoice lines");
  const remaining = invoice.LineItems.map((line: any, index: number) => ({ ...line, index }));
  if (remaining.some((line: any) => Number(line.DiscountRate || 0) !== 0 || Number(line.DiscountAmount || 0) !== 0)) {
    throw new Error("Discounted invoice lines require manual review before linking");
  }
  const totals = new Map(jobs.map(job => [job.id, 0]));
  const table = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;
  for (const job of jobs) {
    const jobItems = items.filter(item => item.jobId === job.id);
    if (!jobItems.length) throw new Error(`No production lines found for ${job.jobName}`);
    if (jobItems.some(item => item.jobType.toLowerCase() !== "embroidery")) {
      throw new Error("Automatic linking currently supports embroidery invoices only; other job types require manual review");
    }
    if (!table) throw new Error("The customer's pricing table is required to verify this invoice");
    const prices = calculateJobPrice(jobItems, table);
    for (const [index, item] of Array.from(jobItems.entries())) {
      const price = prices.lineItemPrices[index];
      const unitPrice = typeof price === "number" ? price : price.unitPrice;
      if (typeof unitPrice !== "number") throw new Error(`A verified unit price is required for ${job.jobName}`);
      const quantity = quantities[item.id] ?? billedQuantityForMatchingLine(jobItems, index);
      const description = `${job.jobName}, ${item.stitchCount} Stitches${job.poNumber ? ` (PO: ${job.poNumber})` : ""}`;
      const match = remaining.findIndex((line: any) =>
        normalise(line.Description || "") === normalise(description) &&
        Number(line.Quantity) === quantity && Number(line.UnitAmount) === unitPrice &&
        pennies(Number(line.LineAmount)) === pennies(quantity * unitPrice));
      if (match < 0) throw new Error(`Invoice lines do not match ${job.jobName} (#${job.jobNumber}) at the recorded quantity and unit price`);
      totals.set(job.id, totals.get(job.id)! + pennies(Number(remaining[match].LineAmount)));
      remaining.splice(match, 1);
    }
  }
  // Match each carriage line to exactly one physical shipment, including repeat names.
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = job.dhlTrackingNumber || job.consolidatedShipmentId || job.id;
    groups.set(key, [...(groups.get(key) || []), job]);
  }
  const names = (values: string[]) => JSON.stringify(values.map(normalise).sort());
  for (const line of remaining) {
    if (normalise(line.ItemCode || "") !== "carriage" || Number(line.Quantity) !== 1 ||
        !Number.isFinite(Number(line.LineAmount)) || Number(line.LineAmount) < 0) {
      throw new Error("The invoice contains unmatched or unsupported lines; no jobs were linked");
    }
    const references = String(line.Description || "").split(" - ").at(-1)!.split(",");
    const matching = Array.from(groups.entries()).filter(([, group]) => names(group.map(jobLabel)) === names(references));
    if (matching.length !== 1) throw new Error("A carriage line cannot be matched unambiguously to the selected shipments");
    const [key, group] = matching[0];
    const carriage = pennies(Number(line.LineAmount));
    const existingOwner = group.find(job => job.invoiceReference === invoice.InvoiceNumber &&
      job.invoiceTotal !== null && pennies(job.invoiceTotal) - totals.get(job.id)! === carriage);
    const owner = existingOwner || group[0];
    totals.set(owner.id, totals.get(owner.id)! + carriage);
    groups.delete(key);
  }
  const total = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0);
  if (!Number.isFinite(Number(invoice.SubTotal)) || total !== pennies(Number(invoice.SubTotal))) {
    throw new Error("Matched job totals do not equal the existing invoice subtotal");
  }
  return Object.fromEntries(Array.from(totals).map(([id, amount]) => [id, amount / 100]));
}
