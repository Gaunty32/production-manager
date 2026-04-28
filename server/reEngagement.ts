import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { sendReEngagementEmail } from "./emailService";

const DORMANT_DAYS = 90;
const RE_EMAIL_COOLDOWN_DAYS = 90;

export interface DormantCustomer {
  id: string;
  name: string;
  email: string;
  contactFirstName: string | null;
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
    daysSinceLastJob: parseInt(r.days_since_last_job) || DORMANT_DAYS,
    lastJobDate: r.last_job_date,
    lastReEngagementEmailAt: r.lastReEngagementEmailAt,
  }));
}

/**
 * Sends re-engagement emails to all eligible dormant customers and
 * records the timestamp so they won't be contacted again for 90 days.
 */
export async function runReEngagementCheck(options: { dryRun?: boolean } = {}): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
  customers: Array<{ name: string; email: string; sent: boolean; error?: string }>;
}> {
  const dormant = await getDormantCustomers();

  let sent = 0;
  const errors: string[] = [];
  const results: Array<{ name: string; email: string; sent: boolean; error?: string }> = [];

  for (const customer of dormant) {
    if (options.dryRun) {
      results.push({ name: customer.name, email: customer.email, sent: false });
      continue;
    }

    try {
      await sendReEngagementEmail({
        name: customer.name,
        email: customer.email,
        contactFirstName: customer.contactFirstName,
      });

      // Record that we emailed them
      await storage.updateCustomer(customer.id, {
        lastReEngagementEmailAt: new Date(),
      } as any);

      sent++;
      results.push({ name: customer.name, email: customer.email, sent: true });
      console.log(`[ReEngagement] Sent email to ${customer.name} <${customer.email}>`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      errors.push(`${customer.name}: ${msg}`);
      results.push({ name: customer.name, email: customer.email, sent: false, error: msg });
      console.error(`[ReEngagement] Failed for ${customer.name}:`, msg);
    }
  }

  return { sent, skipped: dormant.length - sent - errors.length, errors, customers: results };
}

/**
 * Schedules a daily check at 09:00 Europe/London.
 * Uses a simple interval that fires every hour and checks wall-clock time.
 */
export function scheduleDailyReEngagementCheck() {
  const CHECK_HOUR = 9; // 9am

  let lastRunDate: string | null = null;

  const tick = async () => {
    const now = new Date();
    const londonHour = new Date(
      now.toLocaleString("en-US", { timeZone: "Europe/London" })
    ).getHours();
    const todayStr = new Date(
      now.toLocaleString("en-US", { timeZone: "Europe/London" })
    ).toDateString();

    if (londonHour === CHECK_HOUR && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      console.log("[ReEngagement] Running daily check…");
      try {
        const result = await runReEngagementCheck();
        console.log(`[ReEngagement] Done — sent: ${result.sent}, errors: ${result.errors.length}`);
      } catch (err) {
        console.error("[ReEngagement] Scheduler error:", err);
      }
    }
  };

  // Check every 30 minutes
  setInterval(tick, 30 * 60 * 1000);
  console.log("[ReEngagement] Daily check scheduled for 09:00 Europe/London");
}
