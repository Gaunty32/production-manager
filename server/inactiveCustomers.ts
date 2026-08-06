import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import {
  sendInactiveCustomerAlertEmail,
  sendMonthlyInactiveReportEmail,
  type InactiveCustomerRow,
} from "./emailService";

// Where James's alerts and the monthly report go.
const REPORT_RECIPIENT = "james@selectbranding.co.uk";

// 8 weeks quiet = "going quiet"; 3 months quiet = consider closing the account.
const QUIET_DAYS = 56;
const CLOSE_DAYS = 91;

export interface InactiveCustomer extends InactiveCustomerRow {
  id: string;
  daysSinceLastOrder: number;
  inactiveNotifiedAt: string | null;
}

/**
 * Active customers ranked by how long since they last placed an order
 * (submitted/approved/invoiced job). Customers who have never placed an
 * order are measured from their account creation date.
 */
export async function getInactiveCustomers(minDays: number): Promise<InactiveCustomer[]> {
  const result = await db.execute(sql`
    WITH last_job AS (
      SELECT customer_id,
             MAX(GREATEST(
               COALESCE(submitted_at, '-infinity'::timestamp),
               COALESCE(approved_at, '-infinity'::timestamp),
               COALESCE(invoiced_at, '-infinity'::timestamp)
             )) FILTER (WHERE submitted_at IS NOT NULL OR approved_at IS NOT NULL OR invoiced_at IS NOT NULL) AS last_activity
      FROM jobs
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id
    )
    SELECT
      c.id,
      c.name,
      c.email,
      COALESCE(lj.last_activity, c.created_at) AS last_order_date,
      (lj.last_activity IS NULL) AS never_ordered,
      EXTRACT(DAY FROM NOW() - COALESCE(lj.last_activity, c.created_at))::int AS days_inactive,
      c.last_re_engagement_email_at AS check_in_sent_at,
      c.inactive_notified_at AS inactive_notified_at
    FROM customers c
    LEFT JOIN last_job lj ON lj.customer_id = c.id
    WHERE c.active = true
      AND COALESCE(lj.last_activity, c.created_at) < NOW() - (${minDays} || ' days')::interval
    ORDER BY COALESCE(lj.last_activity, c.created_at) ASC
  `);

  return result.rows.map((r: any) => ({
    id: r.id,
    name: r.never_ordered ? `${r.name} (never ordered)` : r.name,
    email: r.email || null,
    daysSinceLastOrder: parseInt(r.days_inactive) || minDays,
    lastOrderDate: r.never_ordered ? null : r.last_order_date,
    checkInSentAt: r.check_in_sent_at,
    inactiveNotifiedAt: r.inactive_notified_at,
  }));
}

export async function getActiveCustomerCount(): Promise<number> {
  const result = await db.execute(sql`SELECT COUNT(*) AS n FROM customers WHERE active = true`);
  return parseInt((result.rows[0] as any).n) || 0;
}

/**
 * Alerts James about customers who have newly crossed the 3-month mark.
 * A customer is alerted once per spell of inactivity: the notified flag is
 * considered spent only while it is newer than their last order, so a
 * customer who comes back and later goes quiet again will be re-flagged.
 */
export async function runInactiveAlertCheck(options: { dryRun?: boolean } = {}): Promise<{
  alerted: InactiveCustomer[];
}> {
  const all = await getInactiveCustomers(CLOSE_DAYS);
  const eligible = all.filter(c => {
    if (!c.inactiveNotifiedAt) return true;
    if (!c.lastOrderDate) return false; // never-ordered accounts: alert once only
    return new Date(c.inactiveNotifiedAt) < new Date(c.lastOrderDate);
  });

  if (eligible.length === 0 || options.dryRun) return { alerted: eligible };

  // Atomically claim the rows first so overlapping runs / multiple server
  // instances can't send the same customer twice. Only rows still matching
  // the eligibility condition get claimed and included in the digest.
  const ids = eligible.map(c => c.id);
  const claimed = await db.execute(sql`
    UPDATE customers c
    SET inactive_notified_at = NOW()
    WHERE c.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
      AND c.active = true
      AND (
        c.inactive_notified_at IS NULL
        OR c.inactive_notified_at < (
          SELECT MAX(GREATEST(
            COALESCE(j.submitted_at, '-infinity'::timestamp),
            COALESCE(j.approved_at, '-infinity'::timestamp),
            COALESCE(j.invoiced_at, '-infinity'::timestamp)
          ))
          FROM jobs j WHERE j.customer_id = c.id
        )
      )
    RETURNING c.id
  `);
  const claimedIds = new Set(claimed.rows.map((r: any) => r.id));
  const toAlert = eligible.filter(c => claimedIds.has(c.id));
  if (toAlert.length === 0) return { alerted: [] };

  try {
    await sendInactiveCustomerAlertEmail({ to: REPORT_RECIPIENT, customers: toAlert });
  } catch (err) {
    // Release the claim so a later run retries these customers.
    await db.execute(sql`
      UPDATE customers SET inactive_notified_at = NULL
      WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(Array.from(claimedIds))}::jsonb))
    `);
    throw err;
  }
  console.log(`[InactiveCustomers] Alerted ${REPORT_RECIPIENT} about ${toAlert.length} customer(s) at 3+ months`);
  return { alerted: toAlert };
}

/**
 * Atomically claims a named scheduler slot (e.g. one calendar day or month)
 * using the app_settings table, so restarts and multiple instances can't
 * run the same slot twice. Returns true when this caller won the slot.
 */
async function claimSlot(key: string, slotValue: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${slotValue}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${slotValue}, updated_at = NOW()
    WHERE app_settings.value IS DISTINCT FROM ${slotValue}
    RETURNING key
  `);
  return result.rows.length > 0;
}

/** Sends the monthly inactive-customer report to James. */
export async function sendMonthlyInactiveReport(): Promise<{ quiet: number; consider: number }> {
  const [quietList, activeCount] = await Promise.all([
    getInactiveCustomers(QUIET_DAYS),
    getActiveCustomerCount(),
  ]);
  const consider = quietList.filter(c => c.daysSinceLastOrder >= CLOSE_DAYS);
  const quiet = quietList.filter(c => c.daysSinceLastOrder < CLOSE_DAYS);

  const monthLabel = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });

  await sendMonthlyInactiveReportEmail({
    to: REPORT_RECIPIENT,
    monthLabel,
    activeCustomerCount: activeCount,
    eightWeekPlus: quiet,
    threeMonthPlus: consider,
  });
  console.log(`[InactiveCustomers] Monthly report sent to ${REPORT_RECIPIENT}: ${consider.length} to consider closing, ${quiet.length} going quiet`);
  return { quiet: quiet.length, consider: consider.length };
}

/**
 * Daily 3-month alert check and, each new month, the monthly report.
 * Runs on any tick from 08:00 London onwards; durable slot claims in
 * app_settings mean restarts and multiple instances can't double-send,
 * and a restart during the morning window doesn't skip the day.
 */
export function scheduleInactiveCustomerChecks() {
  // Only the published app should email James — a development workspace
  // pointing at test data must never send real alerts.
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production") {
    console.log("[InactiveCustomers] Not in production — scheduler disabled");
    return;
  }
  const tick = async () => {
    const london = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
    if (london.getHours() < 8) return;

    const dayKey = `${london.getFullYear()}-${london.getMonth() + 1}-${london.getDate()}`;
    const monthKey = `${london.getFullYear()}-${london.getMonth() + 1}`;

    try {
      if (await claimSlot("inactive_alert_last_day", dayKey)) {
        await runInactiveAlertCheck();
      }
    } catch (err) {
      console.error("[InactiveCustomers] Alert check failed:", err);
    }

    try {
      if (await claimSlot("inactive_report_last_month", monthKey)) {
        await sendMonthlyInactiveReport();
      }
    } catch (err) {
      console.error("[InactiveCustomers] Monthly report failed:", err);
    }
  };

  setTimeout(tick, 90 * 1000); // catch up shortly after startup
  setInterval(tick, 30 * 60 * 1000);
  console.log("[InactiveCustomers] Scheduled — daily 3-month alerts and monthly report from 08:00 Europe/London");
}
