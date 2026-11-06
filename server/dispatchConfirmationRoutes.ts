import type { Express, RequestHandler } from "express";
import type { IStorage } from "./storage";
import { canShareDispatchConfirmation, MEROX_DISPATCH_CUSTOMER_ID } from "../shared/dispatch-confirmation";
import { createDispatchToken, shipmentFingerprint, verifyDispatchToken } from "./dispatchConfirmationTokens";
import { renderDispatchConfirmationPage } from "./dispatchConfirmationPage";

type Dependencies = {
  storage: Pick<IStorage, "getCustomerUserById" | "getJob" | "getCustomer">;
  authenticateCustomer: RequestHandler;
  getSecret: () => string;
};

export function registerDispatchConfirmationRoutes(app: Express, deps: Dependencies) {
  app.post("/api/customer-portal/jobs/:jobId/dispatch-confirmation", deps.authenticateCustomer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const session = req.session as any;
      const userId = session?.impersonationCustomerUserId || session?.customerUserId;
      const user = userId ? await deps.storage.getCustomerUserById(userId) : undefined;
      if (!user) return res.status(401).json({ error: "Please sign in again" });
      const job = await deps.storage.getJob(req.params.jobId);
      // Ownership is checked before eligibility to avoid exposing other customers' orders.
      if (!job || job.customerId !== user.customerId) return res.status(404).json({ error: "Order not found" });
      if (!canShareDispatchConfirmation(job)) {
        return res.status(403).json({ error: "Dispatch sharing is only available for completed Merox DPD orders" });
      }
      const token = createDispatchToken({ ...job, dhlTrackingNumber: job.dhlTrackingNumber! }, deps.getSecret());
      return res.json({ path: `/delivery-update/${token}`, expiresInDays: 90 });
    } catch (error) {
      console.error("Could not create dispatch confirmation link");
      return res.status(500).json({ error: "Could not create the dispatch link. Please try again." });
    }
  });

  app.get("/delivery-update/:token", async (req, res) => {
    res.set({
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    try {
      const payload = verifyDispatchToken(req.params.token, deps.getSecret());
      if (!payload || payload.customerId !== MEROX_DISPATCH_CUSTOMER_ID) {
        return res.status(404).type("html").send(renderDispatchConfirmationPage(null));
      }
      const job = await deps.storage.getJob(payload.jobId);
      if (!job || job.customerId !== payload.customerId || !canShareDispatchConfirmation(job) ||
        shipmentFingerprint(job.dhlTrackingNumber!) !== payload.shipment) {
        return res.status(404).type("html").send(renderDispatchConfirmationPage(null));
      }
      const customer = await deps.storage.getCustomer(job.customerId);
      if (!customer) return res.status(404).type("html").send(renderDispatchConfirmationPage(null));
      // Queue time is when dispatch was recorded, NOT evidence of collection.
      // Historical jobs without this timestamp must not get a fabricated date.
      const recordedAt = job.dispatchEmailQueuedAt;
      return res.type("html").send(renderDispatchConfirmationPage({
        brandName: customer.name,
        logoUrl: customer.logoUrl,
        reference: job.poNumber?.trim() || `Order ${job.jobNumber ?? "reference unavailable"}`,
        dispatchRecordedAt: recordedAt ? new Date(recordedAt).toISOString() : null,
      }));
    } catch {
      console.error("Could not load dispatch confirmation");
      return res.status(503).type("html").send(renderDispatchConfirmationPage(null));
    }
  });
}
