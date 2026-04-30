import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { sendReEngagementEmail } from "./emailService";
import { getEmailBudget } from "./emailBudget";

const DORMANT_DAYS = 90;
const RE_EMAIL_COOLDOWN_DAYS = 90;

// How much of the daily budget to reserve for transactional emails
// (order acks, chat notifications, password resets, etc.)
const TRANSACTIONAL_RESERVE = 20;

export interface DormantCustomer {
  id: string;
  name: string;
  email: string;
  contactFirstName: string | null;
  logoUrl: string | null;
  daysSinceLastJob: number;
  lastJobDate: string;
  lastReEngagementEmailAt: string | null;
}

/**
 * Returns customers who:
 * - Are active and have an email address
 * - Have not had a job (submitted/approved/invoiced) in 90+ days
 * - Have not been sent a re-engagement email in the last 90 days
 */
export async function getDormantCustomers(): Promise<DormantCustomer[]> {
  const result = await db.execute(sql`
    WITH last_job AS (
      SELECT
        customer_id,
        MAX(COALESCE(submitted_at, approved_at, invoiced_at)) AS last_activity
      FROM jobs
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id
    )
    SELECT
      c.id,
      c.name,
      c.email,
      c.contact_first_name AS "contactFirstName",
      c.logo_url AS "logoUrl",
      c.last_re_engagement_email_at AS "lastReEngagementEmailAt",
      lj.last_activity AS last_job_date,
      EXTRACT(DAY FROM NOW() - lj.last_activity)::int AS days_since_last_job
    FROM customers c
    JOIN last_job lj ON lj.customer_id = c.id
    WHERE c.active = true
      AND c.email IS NOT NULL
      AND c.email != ''
      AND lj.last_activity IS NOT NULL
      AND lj.last_activity < NOW() - (${DORMANT_DAYS} || ' days')::interval
      AND (
        c.last_re_engagement_email_at IS NULL
        OR c.last_re_engagement_email_at < NOW() - (${RE_EMAIL_COOLDOWN_DAYS} || ' days')::interval
      )
    ORDER BY lj.last_activity ASC
  `);

  return result.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    contactFirstName: r.contactFirstName,
    logoUrl: r.logoUrl ?? null,
    daysSinceLastJob: parseInt(r.days_since_last_job) || DORMANT_DAYS,
    lastJobDate: r.last_job_date,
    lastReEngagementEmailAt: r.lastReEngagementEmailAt,
  }));
}

/**
 * Sends re-engagement emails to eligible dormant customers up to the
 * given limit. Passing limit=0 means "send as many as budget allows".
 * Each sent customer has their lastReEngagementEmailAt timestamp updated
 * so they won't be contacted again for 90 days.
 */
export async function runReEngagementCheck(options: {
  dryRun?: boolean;
  limit?: number;
} = {}): Promise<{
  sent: number;
  skipped: number;
  budgetSkipped: number;
  errors: string[];
  customers: Array<{ name: string; email: string; sent: boolean; error?: string }>;
}> {
  const dormant = await getDormantCustomers();

  // Work out how many we're allowed to send right now
  const budget = getEmailBudget();
  const budgetAvailable = Math.max(0, budget.remaining - TRANSACTIONAL_RESERVE);
  const hardLimit = options.limit !== undefined ? options.limit : budgetAvailable;
  const sendLimit = Math.min(hardLimit, budgetAvailable);

  console.log(
    `[ReEngagement] Eligible: ${dormant.length} | Budget: ${budget.sent}/${budget.limit} sent today | Available for re-engagement: ${sendLimit}`
  );

  if (sendLimit <= 0 && !options.dryRun) {
    console.log("[ReEngagement] No budget available — skipping this run");
    return {
      sent: 0,
      skipped: 0,
      budgetSkipped: dormant.length,
      errors: [],
      customers: dormant.map(c => ({ name: c.name, email: c.email, sent: false })),
    };
  }

  let sent = 0;
  let budgetSkipped = 0;
  const errors: string[] = [];
  const results: Array<{ name: string; email: string; sent: boolean; error?: string }> = [];

  for (const customer of dormant) {
    if (options.dryRun) {
      results.push({ name: customer.name, email: customer.email, sent: false });
      continue;
    }

    if (sent >= sendLimit) {
      budgetSkipped++;
      results.push({ name: customer.name, email: customer.email, sent: false });
      continue;
    }

    try {
      await sendReEngagementEmail({
        name: customer.name,
        email: customer.email,
        contactFirstName: customer.contactFirstName,
        logoUrl: customer.logoUrl,
      });

      // Record that we emailed them — won't be eligible again for 90 days
      await storage.updateCustomer(customer.id, {
        lastReEngagementEmailAt: new Date(),
      } as any);

      sent++;
      results.push({ name: customer.name, email: customer.email, sent: true });
      console.log(`[ReEngagement] Sent to ${customer.name} <${customer.email}>`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      errors.push(`${customer.name}: ${msg}`);
      results.push({ name: customer.name, email: customer.email, sent: false, error: msg });
      console.error(`[ReEngagement] Failed for ${customer.name}:`, msg);
    }
  }

  if (budgetSkipped > 0) {
    console.log(
      `[ReEngagement] ${budgetSkipped} customers deferred — will be picked up in a future run when budget allows`
    );
  }

  return {
    sent,
    skipped: dormant.length - sent - budgetSkipped - errors.length,
    budgetSkipped,
    errors,
    customers: results,
  };
}

/**
 * Schedules budget-aware re-engagement checks throughout the working day.
 *
 * Runs every 2 hours from 09:00 to 17:00 (Europe/London). Each run:
 *  1. Checks how many emails have already been sent today.
 *  2. Reserves TRANSACTIONAL_RESERVE slots for time-sensitive emails.
 *  3. Sends re-engagement emails only up to the remaining allowance.
 *
 * This means a large backlog of dormant customers is spread across
 * multiple days rather than exhausting the daily quota in one go.
 */
export function scheduleDailyReEngagementCheck() {
  // Hours (London time) at which we attempt a send
  const CHECK_HOURS = [9, 11, 13, 15, 17];

  const lastRunByHour = new Map<string, boolean>();

  const tick = async () => {
    const now = new Date();
    const londonStr = now.toLocaleString("en-US", { timeZone: "Europe/London" });
    const londonDate = new Date(londonStr);
    const londonHour = londonDate.getHours();
    const todayStr = londonDate.toDateString();
    const slotKey = `${todayStr}_${londonHour}`;

    if (!CHECK_HOURS.includes(londonHour)) return;
    if (lastRunByHour.get(slotKey)) return;

    lastRunByHour.set(slotKey, true);

    const budget = getEmailBudget();
    const available = Math.max(0, budget.remaining - TRANSACTIONAL_RESERVE);

    console.log(
      `[ReEngagement] ${londonHour}:00 check — budget ${budget.sent}/${budget.limit} used, ${available} available for re-engagement`
    );

    if (available <= 0) {
      console.log("[ReEngagement] No budget available — skipping");
      return;
    }

    try {
      const result = await runReEngagementCheck();
      console.log(
        `[ReEngagement] Done — sent: ${result.sent}, deferred (budget): ${result.budgetSkipped}, errors: ${result.errors.length}`
      );
    } catch (err) {
      console.error("[ReEngagement] Scheduler error:", err);
    }
  };

  // Check every 30 minutes (fine-grained enough to hit each hour window)
  setInterval(tick, 30 * 60 * 1000);
  console.log("[ReEngagement] Smart send scheduled — checks at 09:00, 11:00, 13:00, 15:00, 17:00 Europe/London");
}
