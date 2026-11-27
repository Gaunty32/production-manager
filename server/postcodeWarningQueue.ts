import { createHash } from "node:crypto";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { customers, jobs, postcodeWarningEmails, type Job } from "@shared/schema";
import { getOrderPostcodeReview } from "@shared/dpd-shipping-quote";
import { db } from "./db";
import { sendPostcodeWarningEmail } from "./emailService";

export function postcodeWarningId(jobId: string, postcode: string, warning: string) {
  return createHash("sha256").update(JSON.stringify([jobId, postcode, warning])).digest("hex");
}

// The caller supplies its existing transaction so an order save and its alert
// either both commit or both roll back. No historical eligibility sweep.
export async function queueOrderPostcodeWarning(tx: any, job: Pick<Job, "id" | "customerId"> & Partial<Job>) {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, job.customerId));
  const review = getOrderPostcodeReview(job, customer?.address);
  if (!review?.warning) return;
  const id = postcodeWarningId(job.id, review.postcode, review.warning);
  await tx.insert(postcodeWarningEmails).values({
    id, jobId: job.id, postcode: review.postcode, warning: review.warning,
  }).onConflictDoNothing();
}

let running = false;
export async function processPostcodeWarningEmails() {
  if (running || process.env.NODE_ENV !== "production") return;
  running = true;
  try {
    // Each send holds a row lock; parallel server instances skip locked alerts.
    for (let i = 0; i < 10; i++) {
      const handled = await db.transaction(async tx => {
        const [alert] = await tx.select().from(postcodeWarningEmails).where(and(
          isNull(postcodeWarningEmails.sentAt), isNull(postcodeWarningEmails.cancelledAt),
          lte(postcodeWarningEmails.nextAttemptAt, new Date()),
        )).orderBy(asc(postcodeWarningEmails.queuedAt)).limit(1).for("update", { skipLocked: true });
        if (!alert) return false;
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, alert.jobId));
        if (!job) return false;
        const [customer] = await tx.select().from(customers).where(eq(customers.id, job.customerId));
        const current = getOrderPostcodeReview(job, customer?.address);
        if (current?.postcode !== alert.postcode || current?.warning !== alert.warning) {
          await tx.update(postcodeWarningEmails).set({ cancelledAt: new Date(), lastError: "Destination warning superseded before sending." })
            .where(eq(postcodeWarningEmails.id, alert.id));
          return true;
        }
        try {
          await sendPostcodeWarningEmail({
            jobId: job.id, jobNumber: job.jobNumber, jobName: job.jobName,
            customerName: customer?.name || "Customer", postcode: alert.postcode,
            warning: alert.warning, idempotencyKey: `postcode-warning/${alert.id}`,
          });
          await tx.update(postcodeWarningEmails).set({ sentAt: new Date(), attempts: alert.attempts + 1, lastError: null })
            .where(eq(postcodeWarningEmails.id, alert.id));
        } catch (error) {
          await tx.update(postcodeWarningEmails).set({
            attempts: alert.attempts + 1,
            nextAttemptAt: new Date(Date.now() + Math.min(30, 2 ** Math.min(alert.attempts, 5)) * 60_000),
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed",
          }).where(eq(postcodeWarningEmails.id, alert.id));
          console.error("[PostcodeWarnings] Email deferred; it remains queued for retry.");
        }
        return true;
      });
      if (!handled) break;
    }
  } catch (error) {
    console.error("[PostcodeWarnings] Could not process queued alerts:", error instanceof Error ? error.message : "Queue error");
  } finally {
    running = false;
  }
}

export function startPostcodeWarningWorker() {
  if (process.env.NODE_ENV !== "production") return;
  void processPostcodeWarningEmails();
  setInterval(() => { void processPostcodeWarningEmails(); }, 30_000).unref();
}
