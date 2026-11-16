import type { Express, RequestHandler } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { jobs, jobLineItems, canViewPrices } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { xeroService } from "./xero";
import { matchExistingInvoice } from "./existingInvoiceMatch";
import { getInvoiceQuantities } from "./invoiceQuantities";
import { parseXeroInvoiceDate } from "./overdueInvoiceRules";

export function registerExistingInvoiceRoutes(app: Express, staffAuth: RequestHandler) {
  app.post("/api/xero/link-existing-invoice", staffAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role)) return res.status(403).json({ error: "Permission denied" });
      const input = z.object({
        customerId: z.string().min(1), jobIds: z.array(z.string().min(1)).min(1).max(100),
        invoiceNumber: z.string().trim().min(1).max(80),
        confirm: z.boolean().default(false), previewHash: z.string().optional(),
      }).parse(req.body);
      if (new Set(input.jobIds).size !== input.jobIds.length) throw new Error("Select each order only once");
      const number = /^\d+$/.test(input.invoiceNumber) ? `INV-${input.invoiceNumber}` : input.invoiceNumber;
      const customer = await storage.getCustomer(input.customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      // Only GET requests are used in Xero. Never create a contact, invoice or payment.
      const invoice = await xeroService.getInvoiceByNumber(number);
      const contact = await xeroService.findContact(customer);
      if (!contact || invoice.Contact?.ContactID !== contact.contactID) {
        throw new Error("This Xero invoice does not belong to the selected customer");
      }
      const invoiceDate = parseXeroInvoiceDate(invoice.Date);
      if (!Number.isFinite(invoiceDate)) throw new Error("The invoice date could not be verified");
      const quantities = await getInvoiceQuantities();
      const result = await db.transaction(async tx => {
        // Include already-linked jobs so duplicate descriptions cannot reuse their lines.
        const candidates = await tx.select().from(jobs).where(or(
          inArray(jobs.id, input.jobIds),
          and(eq(jobs.customerId, customer.id), eq(jobs.invoiceReference, invoice.InvoiceNumber)),
        )).orderBy(jobs.jobNumber, jobs.id).for("update");
        if (input.jobIds.some(id => !candidates.some(job => job.id === id))) throw new Error("A selected order no longer exists");
        if (candidates.some(job => job.customerId !== customer.id)) throw new Error("All selected jobs must belong to this customer");
        if (candidates.some(job => job.invoiceStatus !== "ready" &&
          !(job.invoiceStatus === "invoiced" && job.invoiceReference === invoice.InvoiceNumber))) {
          throw new Error("An order has changed status or is linked to a different invoice. Refresh the queue.");
        }
        const items = await tx.select().from(jobLineItems).where(inArray(jobLineItems.jobId, candidates.map(job => job.id))).for("update");
        const totals = matchExistingInvoice(invoice, customer, candidates, items, quantities);
        const preview = {
          invoiceNumber: invoice.InvoiceNumber, subTotal: invoice.SubTotal, total: invoice.Total,
          jobs: candidates.map(job => ({
            id: job.id, jobName: job.jobName, jobNumber: job.jobNumber,
            total: totals[job.id], alreadyLinked: job.invoiceReference === invoice.InvoiceNumber && job.invoiceStatus === "invoiced",
          })),
        };
        const previewHash = createHash("sha256").update(JSON.stringify({ invoice, totals })).digest("hex");
        if (input.confirm) {
          if (input.previewHash !== previewHash) throw new Error("The invoice or job details changed. Check the invoice again before linking.");
          for (const job of candidates) {
            await tx.update(jobs).set({
              invoiceStatus: "invoiced", invoiceReference: invoice.InvoiceNumber,
              invoicedAt: job.invoicedAt || new Date(invoiceDate), invoiceTotal: totals[job.id],
            }).where(eq(jobs.id, job.id));
          }
        }
        return { ...preview, previewHash, linked: input.confirm };
      });
      res.json(result);
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Could not link the existing invoice" });
    }
  });
}
