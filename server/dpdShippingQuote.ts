import type { Express, RequestHandler } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { jobs, stockingOrders, canViewPrices, type Job } from "@shared/schema";
import { calculateDpdShippingQuote, dpdQuoteInputSchema, type DpdQuoteInput } from "@shared/dpd-shipping-quote";
import { getDispatchIssues, isCustomerProvidedLabel } from "@shared/shipping-details";
import { storage } from "./storage";
import { db } from "./db";

export function prepareDpdQuoteApproval(target: Job, customerJobs: Job[], input: DpdQuoteInput) {
  if (input.packageType !== "boxes" || input.packageCount <= 4) {
    throw new Error("Estimate approval is for shipments above four boxes. Existing smaller-shipment prices stay unchanged.");
  }
  if (!["direct_delivery", "consolidated"].includes(target.shippingMethod || "") || !target.dhlTrackingNumber?.trim()) {
    throw new Error("Record the existing shipment's dispatch method and tracking first. This action does not book a label.");
  }
  const members = customerJobs.filter(other => other.customerId === target.customerId && (
    other.id === target.id
    || (!!target.dhlTrackingNumber && other.dhlTrackingNumber === target.dhlTrackingNumber)
    || (!!target.consolidatedShipmentId && other.consolidatedShipmentId === target.consolidatedShipmentId)
  ));
  if (members.some(job => !["pending", "ready", "draft"].includes(job.invoiceStatus))) {
    throw new Error("This shipment includes an issued invoice. Its carriage cannot be replaced here.");
  }
  if (members.some(job => isCustomerProvidedLabel(job))) throw new Error("Customer-provided courier labels must have no carriage charge.");
  if (members.some(job => job.shippingCarrier && job.shippingCarrier !== "dpd")) throw new Error("Only DPD shipments can use this estimate.");
  if (members.some(job => job.packageCount !== input.packageCount || !["box", "boxes"].includes(job.packageType || ""))) {
    throw new Error("The quote's box count must match the recorded shipment on every linked order. Review shipping first.");
  }
  const owners = members.filter(job => job.shippingCost !== null && job.shippingCost !== undefined && job.shippingCost !== "");
  if (owners.length > 1) throw new Error("This shipment has more than one carriage charge recorded. Review the shared shipping charge before approving an estimate.");
  const owner = owners[0];
  if (owner && owner.id !== target.id) throw new Error("Approve the estimate on the order holding this shipment's carriage charge.");
  return { members, quote: calculateDpdShippingQuote(input) };
}

// Internal courier cost, markup and approval identity never belong in the
// customer portal (including its public demo), even on generic job responses.
export function stripInternalShippingQuote(value: any): any {
  if (Array.isArray(value)) return value.map(stripInternalShippingQuote);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "shippingQuote")
      .map(([key, item]) => [key, stripInternalShippingQuote(item)]));
  }
  return value;
}

export function registerDpdShippingQuoteRoutes(app: Express, authenticate: RequestHandler) {
  app.use(["/api/customer-portal", "/api/demo/customer"], (_req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = (body: any) => sendJson(stripInternalShippingQuote(body));
    next();
  });
  app.post("/api/dpd/shipping-quote", authenticate, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role)) return res.status(403).json({ error: "Pricing access is required." });
      res.json(calculateDpdShippingQuote(dpdQuoteInputSchema.parse(req.body.input)));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to calculate the estimate." });
    }
  });
  app.post("/api/jobs/:id/dpd-shipping-quote", authenticate, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role) || user.role === "demo") return res.status(403).json({ error: "Pricing approval access is required." });
      const { input } = z.object({
        input: dpdQuoteInputSchema, approved: z.literal(true), confirmedDpd: z.literal(true),
      }).parse(req.body);
      const target = await storage.getJob(req.params.id);
      if (!target) return res.status(404).json({ error: "Order not found." });
      const [stocking] = await db.select().from(stockingOrders).where(eq(stockingOrders.jobId, target.id));
      if (stocking) return res.status(409).json({ error: "Use the separate Abode carriage workflow." });
      const result = await db.transaction(async tx => {
        // All customer shipment members are locked in deterministic order.
        // This serialises approvals and catches an invoice/status change before writing.
        const customerJobs = await tx.select().from(jobs).where(eq(jobs.customerId, target.customerId)).orderBy(asc(jobs.id)).for("update");
        const current = customerJobs.find(job => job.id === target.id);
        if (!current) throw new Error("The order changed. Refresh before approving.");
        const { members, quote } = prepareDpdQuoteApproval(current, customerJobs, input);
        const approved = { ...quote, approvedAt: new Date().toISOString(), approvedBy: user.id };
        const candidates = members.map(job => ({
          ...job, shippingCost: job.id === current.id ? quote.customerCharge.toFixed(2) : null,
        }));
        if (getDispatchIssues(candidates, candidates).length) throw new Error("Shipping details are incomplete. Review shipping before approving carriage.");
        for (const job of members) {
          await tx.update(jobs).set({
            shippingCost: job.id === current.id ? quote.customerCharge.toFixed(2) : null,
            shippingQuote: job.id === current.id ? approved : null,
            ...(job.completed && job.invoiceStatus === "pending" ? { invoiceStatus: "ready", conversationArchivedByStaff: true } : {}),
          }).where(eq(jobs.id, job.id));
        }
        return approved;
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to approve the estimate." });
    }
  });
}
