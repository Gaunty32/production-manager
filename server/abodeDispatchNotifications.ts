import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { jobs, stockingOrders } from "@shared/schema";
import { isAbodeCustomer } from "@shared/abode";
import { getDpdTrackingUrl } from "@shared/dpd-tracking";
import { db } from "./db";
import { storage } from "./storage";
import { getBaseUrl, sendAbodeDispatchEmail } from "./emailService";

/** Only staff-confirmed despatch after production may send an order email. */
export async function maybeSendAbodeDispatchNotification(
  jobId: string,
  send: typeof sendAbodeDispatchEmail = sendAbodeDispatchEmail,
): Promise<void> {
  try {
    const [row] = await db.select({ job: jobs, order: stockingOrders }).from(stockingOrders)
      .innerJoin(jobs, eq(jobs.id, stockingOrders.jobId)).where(eq(jobs.id, jobId));
    // Only explicit durable queue entries are eligible. Never sweep historical orders.
    if (!row || !row.job.completed || !row.job.dispatchEmailQueuedAt || row.job.dispatchEmailSentAt ||
        !row.order.dispatchedAt) return;
    const customer = await storage.getCustomer(row.job.customerId);
    if (!isAbodeCustomer(customer)) return;
    const contacts = (await storage.getCustomerUsersByCustomerId(row.job.customerId))
      .filter(user => user.active && user.emailNotificationsDispatch && user.email?.trim())
      .sort((a, b) => a.id.localeCompare(b.id));
    const recipients = new Map(contacts.map(contact => [contact.email.trim().toLowerCase(), contact]));
    // No recipients is not a successful send: leave the queue pending for retry.
    if (!recipients.size) return;
    const trackingNumber = row.job.dhlTrackingNumber?.trim() || null;
    await Promise.all(Array.from(recipients.entries()).map(([email, contact]) => send(email, {
      customerName: customer!.name,
      customerFirstName: contact.firstName || customer!.contactFirstName || customer!.name,
      customerLogoUrl: customer!.logoUrl,
      orderNumber: row.order.orderNumber,
      trackingNumber,
      carrier: row.order.shippingRoute === "royal_mail" ? "Royal Mail" : "DPD Local",
      trackingUrl: trackingNumber ? getDpdTrackingUrl({
        ...row.job, shippingCarrier: row.order.shippingRoute,
        deliveryAddressType: "custom", deliveryAddress: row.order.recipient.postcode,
      }) : null,
      portalUrl: `${getBaseUrl()}/customer/stockings`,
      idempotencyKey: `abode-despatch-${row.job.id}-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`,
    })));
    await db.update(jobs).set({ dispatchEmailSentAt: new Date() })
      .where(and(eq(jobs.id, jobId), isNull(jobs.dispatchEmailSentAt)));
  } catch (error) {
    console.error("[Abode] Despatch email deferred:", error instanceof Error ? error.message : "Email failed");
  }
}
