import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { appSettings, customers, jobs, jobLineItems } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { sendAwaitingGarmentsReminderEmail } from "./emailService";
import { awaitingGarmentsReminderWeek, awaitingGarmentsSince, needsAwaitingGarmentsReminder } from "./awaitingGarmentsReminderRules";
import { buildAwaitingGarmentsReminderEmail } from "./awaitingGarmentsReminderEmail";
import { deliverAwaitingGarmentsReminder, type GarmentsDeliveryState, type GarmentsReminderStore } from "./awaitingGarmentsReminderDelivery";

const store: GarmentsReminderStore = {
  async mutate(key, update) {
    return db.transaction(async tx => {
      await tx.insert(appSettings).values({ key, value: JSON.stringify({ status: "pending" }) }).onConflictDoNothing();
      const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, key)).for("update");
      const result = update(JSON.parse(row.value) as GarmentsDeliveryState);
      await tx.update(appSettings).set({ value: JSON.stringify(result.state), updatedAt: new Date() }).where(eq(appSettings.key, key));
      return result.result;
    });
  },
};

async function candidateJobs(customerId?: string) {
  return db.select().from(jobs).where(and(
    eq(jobs.status, "production"), eq(jobs.completed, false), isNull(jobs.goodsReceived),
    customerId ? eq(jobs.customerId, customerId) : undefined,
    notExists(db.select({ id: jobLineItems.id }).from(jobLineItems).where(eq(jobLineItems.jobId, jobs.id))),
  ));
}

async function claimScan(week: string, owner: string) {
  const value = JSON.stringify({ owner, leaseUntil: Date.now() + 10 * 60 * 1000 });
  const result = await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${`awaiting_garments_scan_${week}`}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    WHERE app_settings.value::jsonb->>'owner' = ${owner}
       OR COALESCE((app_settings.value::jsonb->>'leaseUntil')::bigint, 0) < ${Date.now()}
    RETURNING key
  `);
  return result.rows.length > 0;
}

export async function runAwaitingGarmentsReminders(week = awaitingGarmentsReminderWeek()) {
  if (!week) return;
  if (await storage.getAppSetting("awaiting_garments_completed_week") === week) return;
  const owner = randomUUID();
  if (!await claimScan(week, owner)) return;
  let retryNeeded = false;
  try {
    const candidates = await candidateJobs();
    const customerIds = Array.from(new Set(candidates.map(job => job.customerId)));
    if (!customerIds.length) {
      await storage.setAppSetting("awaiting_garments_completed_week", week);
      return;
    }
    const customerRows = await db.select().from(customers).where(inArray(customers.id, customerIds));
    const eligibleIds = customerRows.filter(customer =>
      candidates.some(job => job.customerId === customer.id && needsAwaitingGarmentsReminder(job, customer, false))
    ).map(customer => customer.id);
    for (const customerId of eligibleIds) {
      if (!await claimScan(week, owner)) return;
      const outcome = await deliverAwaitingGarmentsReminder(
        store, `awaiting-garments-${week}-${customerId}`,
        async () => {
          // Reload immediately before delivery, including retries: received/moved jobs stop.
          const customer = await storage.getCustomer(customerId);
          if (!customer?.active) return null;
          const waitingJobs = (await candidateJobs(customerId))
            .filter(job => needsAwaitingGarmentsReminder(job, customer, false))
            .sort((a, b) => a.id.localeCompare(b.id));
          if (!waitingJobs.length) return null;
          // A delayed Sunday catch-up must not be followed by another email on Monday.
          const previousWeek = new Date(`${week}T00:00:00Z`);
          previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
          const previous = await storage.getAppSetting(`awaiting-garments-${previousWeek.toISOString().slice(0, 10)}-${customerId}`);
          if (previous) {
            const sentAt = (JSON.parse(previous) as GarmentsDeliveryState).sentAt;
            if (sentAt && Date.now() - sentAt < 7 * 24 * 60 * 60 * 1000) return null;
          }
          const portalUsers = await storage.getCustomerUsersByCustomerId(customerId);
          const addresses = customer.email?.trim() ? [customer.email.trim()]
            : portalUsers.filter(user => user.active).map(user => user.email.trim());
          const to = Array.from(new Set(addresses.map(address => address.toLowerCase()))).sort();
          if (!to.length || to.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))) {
            throw new Error("No valid customer email for awaiting-garments reminder.");
          }
          const email = {
            to, customerName: customer.name, firstName: customer.contactFirstName || customer.name,
            jobs: waitingJobs.map(job => ({
              id: job.id, number: job.jobNumber, name: job.jobName, po: job.poNumber,
              quantity: job.quantity, waitingSince: awaitingGarmentsSince(job)!.toISOString(),
            })),
          };
          return { email, rendered: buildAwaitingGarmentsReminderEmail(email) };
        },
        (payload, key) => sendAwaitingGarmentsReminderEmail(payload.email.to, key, payload.rendered),
      );
      if (["failed", "busy", "pending", "sending"].includes(outcome)) retryNeeded = true;
      console.log(`[AwaitingGarments] Customer ${customerId}, week ${week}: ${outcome}`);
      // Respect the email provider's per-second limits alongside other workers.
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    if (!retryNeeded) await storage.setAppSetting("awaiting_garments_completed_week", week);
  } finally {
    await db.execute(sql`
      UPDATE app_settings SET value = ${JSON.stringify({ owner: "", leaseUntil: Date.now() + 15 * 60 * 1000 })}, updated_at = NOW()
      WHERE key = ${`awaiting_garments_scan_${week}`} AND value::jsonb->>'owner' = ${owner}
    `);
  }
}

export function scheduleAwaitingGarmentsReminders() {
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production") {
    console.log("[AwaitingGarments] Development — email scheduler disabled.");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running || !awaitingGarmentsReminderWeek()) return;
    running = true;
    try { await runAwaitingGarmentsReminders(); }
    catch (error) { console.error("[AwaitingGarments] Scheduler failed:", error); }
    finally { running = false; }
  };
  setTimeout(tick, 60 * 1000);
  setInterval(tick, 5 * 60 * 1000);
  console.log("[AwaitingGarments] Weekly reminders due Mondays 09:00 Europe/London; catches up when awake.");
}
