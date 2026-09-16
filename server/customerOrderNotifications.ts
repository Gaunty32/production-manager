import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { jobs } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import {
  getBaseUrl,
  sendDispatchNotificationEmail,
  sendProductionStartedEmail,
} from "./emailService";

function formatDispatchDate(value: Date | string | null): string {
  if (!value) return "To be confirmed";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "To be confirmed"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      });
}

async function getOperatorDetails(operatorId: string | null) {
  if (!operatorId) return null;
  const operator = (await storage.getStaff()).find((member) => member.id === operatorId);
  if (!operator) return null;
  const user = operator.userId ? await storage.getUser(operator.userId) : undefined;
  return {
    name: operator.name,
    profileImageUrl: user?.profileImageUrl
      ? new URL(user.profileImageUrl, `${getBaseUrl()}/`).toString()
      : null,
  };
}

export async function maybeSendProductionStartedNotification(jobId: string): Promise<void> {
  const job = await storage.getJob(jobId);
  if (
    !job ||
    job.productionStartedEmailSentAt ||
    !job.responsibleOperatorId ||
    job.machineId == null ||
    job.allocationStatus !== "allocated"
  ) return;

  try {
    await db.update(jobs)
      .set({ productionStartedEmailQueuedAt: new Date() })
      .where(and(eq(jobs.id, jobId), isNull(jobs.productionStartedEmailQueuedAt)));
    const customer = await storage.getCustomer(job.customerId);
    const operator = await getOperatorDetails(job.responsibleOperatorId);
    if (!customer || !operator) return;
    const recipients = (await storage.getCustomerUsersByCustomerId(job.customerId))
      .filter((user) => user.active && user.emailNotificationsDispatch && user.email);
    const portalUrl = `${getBaseUrl()}/customer/job/${job.id}`;
    await Promise.all(recipients.map((recipient) =>
      sendProductionStartedEmail(recipient.email, {
        customerFirstName: recipient.firstName || customer.contactFirstName || customer.name,
        jobName: job.jobName,
        operatorName: operator.name,
        operatorProfileImageUrl: operator.profileImageUrl,
        requiredDispatchDate: formatDispatchDate(job.requiredDispatchDate),
        portalUrl,
        customerLogoUrl: customer.logoUrl,
        customerName: customer.name,
        idempotencyKey: `production-started-${job.id}-${recipient.id}`,
      }),
    ));
    await db.update(jobs)
      .set({ productionStartedEmailSentAt: new Date() })
      .where(and(eq(jobs.id, jobId), isNull(jobs.productionStartedEmailSentAt)));
  } catch (error) {
    console.error("[ORDER EMAIL] Production-started notification failed:", error);
  }
}

export async function maybeSendDispatchNotification(jobId: string): Promise<void> {
  const job = await storage.getJob(jobId);
  const trackingNumber = job?.dhlTrackingNumber?.trim();
  if (!job || !job.completed || !trackingNumber || job.dispatchEmailSentAt) return;

  try {
    await db.update(jobs)
      .set({ dispatchEmailQueuedAt: new Date() })
      .where(and(eq(jobs.id, jobId), isNull(jobs.dispatchEmailQueuedAt)));
    const groupedJobs = (await db.select().from(jobs).where(and(
      eq(jobs.customerId, job.customerId),
      eq(jobs.dhlTrackingNumber, trackingNumber),
      eq(jobs.completed, true),
    )))
      .filter((groupedJob) => !groupedJob.dispatchEmailSentAt)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (groupedJobs.length === 0) return;
    const customer = await storage.getCustomer(job.customerId);
    const completedById = job.completedById || job.responsibleOperatorId;
    const operator = await getOperatorDetails(completedById);
    if (!customer) return;
    const recipients = (await storage.getCustomerUsersByCustomerId(job.customerId))
      .filter((user) => user.active && user.emailNotificationsDispatch && user.email);
    const portalUrl = `${getBaseUrl()}/customer/dashboard`;
    await Promise.all(recipients.map((recipient) =>
      sendDispatchNotificationEmail([recipient.email], {
        customerName: customer.name,
        customerFirstName: recipient.firstName || customer.contactFirstName || customer.name,
        jobNames: groupedJobs.map((groupedJob) => groupedJob.jobName),
        trackingNumber,
        portalUrl,
        completedByName: operator?.name,
        operatorProfileImageUrl: operator?.profileImageUrl,
        customerLogoUrl: customer.logoUrl,
        idempotencyKey: `dispatch-${job.customerId}-${trackingNumber}-${recipient.id}`,
      }),
    ));
    await db.update(jobs)
      .set({ dispatchEmailSentAt: new Date() })
      .where(and(
        eq(jobs.customerId, job.customerId),
        eq(jobs.dhlTrackingNumber, trackingNumber),
        eq(jobs.completed, true),
        isNull(jobs.dispatchEmailSentAt),
      ));
  } catch (error) {
    console.error("[ORDER EMAIL] Dispatch notification failed:", error);
  }
}

let retryWorkerStarted = false;

export function startCustomerOrderNotificationRetryWorker(): void {
  if (retryWorkerStarted) return;
  retryWorkerStarted = true;

  const retryPending = async () => {
    try {
      const productionJobs = await db.select({ id: jobs.id }).from(jobs).where(and(
        isNotNull(jobs.productionStartedEmailQueuedAt),
        isNull(jobs.productionStartedEmailSentAt),
        isNotNull(jobs.responsibleOperatorId),
        isNotNull(jobs.machineId),
        eq(jobs.allocationStatus, "allocated"),
      ));
      const dispatchJobs = await db.select({ id: jobs.id }).from(jobs).where(and(
        isNotNull(jobs.dispatchEmailQueuedAt),
        isNull(jobs.dispatchEmailSentAt),
        eq(jobs.completed, true),
        isNotNull(jobs.dhlTrackingNumber),
      ));
      await Promise.all([
        ...productionJobs.map(({ id }) => maybeSendProductionStartedNotification(id)),
        ...dispatchJobs.map(({ id }) => maybeSendDispatchNotification(id)),
      ]);
    } catch (error) {
      console.error("[ORDER EMAIL] Retry sweep failed:", error);
    }
  };

  void retryPending();
  const timer = setInterval(() => void retryPending(), 5 * 60 * 1000);
  timer.unref();
}