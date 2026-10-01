import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { appSettings } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { xeroService } from "./xero";
import { buildOverdueInvoiceReminderEmail, sendOverdueInvoiceReminderEmail } from "./emailService";
import { isOverdueInvoice, overdueReminderWeek } from "./overdueInvoiceRules";
import { deliverOverdueReminder, type ReminderState, type ReminderStore } from "./overdueReminderDelivery";

// Existing app_settings gives durable row locks without a schema migration.
export const overdueReminderStore: ReminderStore = {
  async mutate(key, update) {
    return db.transaction(async tx => {
      await tx.insert(appSettings).values({ key, value: JSON.stringify({ status: "pending" }) })
        .onConflictDoNothing();
      const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, key)).for("update");
      const result = update(JSON.parse(row.value) as ReminderState);
      await tx.update(appSettings).set({ value: JSON.stringify(result.state), updatedAt: new Date() })
        .where(eq(appSettings.key, key));
      return result.result;
    });
  },
};

/** A renewable scan lease prevents multiple Autoscale instances flooding Xero. */
async function claimScan(week: string, owner: string): Promise<boolean> {
  const value = JSON.stringify({ owner, leaseUntil: Date.now() + 10 * 60 * 1000 });
  const result = await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${`overdue_reminder_scan_${week}`}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    WHERE (app_settings.value::jsonb->>'owner') = ${owner}
       OR COALESCE((app_settings.value::jsonb->>'leaseUntil')::bigint, 0) < ${Date.now()}
    RETURNING key
  `);
  return result.rows.length > 0;
}

export async function runOverdueInvoiceReminders(week = overdueReminderWeek()): Promise<void> {
  if (!week) return;
  if (await storage.getAppSetting("overdue_reminder_completed_week") === week) return;
  // Reload DB tokens so catch-up runs also see a newly connected Xero account.
  await xeroService.loadTokensFromDb();
  if (!xeroService.isConfigured() || !xeroService.isConnected()) {
    console.warn("[OverdueReminders] Xero unavailable; will retry, no reminders sent.");
    return;
  }
  const owner = randomUUID();
  if (!await claimScan(week, owner)) return;
  const counts = { sent: 0, skipped: 0, rejected: 0, review: 0, failed: 0, busy: 0 };
  try {
    const customers = (await storage.getCustomers()).filter(customer => customer.active);
    const users = await storage.getAllCustomerUsers();
    for (const customer of customers) {
      if (!await claimScan(week, owner)) {
        console.warn("[OverdueReminders] Scan lease lost; another instance will finish.");
        return;
      }
      try {
        const outcome = await deliverOverdueReminder(
          overdueReminderStore,
          `overdue-reminder-${week}-${customer.id}`,
          async () => {
            const contact = await xeroService.findContactForReminder(customer);
            if (!contact) {
              console.warn(`[OverdueReminders] No exact Xero match for customer ${customer.id}; skipped.`);
              return null;
            }
            const invoices = (await xeroService.getInvoicesForReminder(contact.contactID))
              .filter(invoice => isOverdueInvoice(invoice));
            if (!invoices.length) return null;
            // Use the account contact email; active portal users are the fallback.
            // Message/dispatch opt-outs don't apply to transactional billing.
            const addresses = customer.email?.trim()
              ? [customer.email.trim()]
              : users.filter(user => user.customerId === customer.id && user.active).map(user => user.email.trim());
            const to = Array.from(new Set(addresses.map(email => email.toLowerCase())));
            if (!to.length || to.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
              throw new Error("Customer has overdue invoices but no valid reminder recipient.");
            }
            const email = {
              to, customerName: customer.name,
              customerFirstName: customer.contactFirstName || customer.name,
              invoices: invoices.map(invoice => ({
                invoiceNumber: invoice.InvoiceNumber, date: invoice.Date,
                amountDue: invoice.AmountDue, currencyCode: invoice.CurrencyCode,
              })),
            };
            return { email, rendered: buildOverdueInvoiceReminderEmail(email) };
          },
          (payload, key) => sendOverdueInvoiceReminderEmail(payload.email, key, payload.rendered),
        );
        if (outcome === "sending" || outcome === "pending") counts.busy++;
        else counts[outcome]++;
        if (["failed", "review", "rejected"].includes(outcome)) {
          console.warn(`[OverdueReminders] Customer ${customer.id}: ${outcome}; see durable delivery record.`);
        }
      } catch (error) {
        counts.failed++;
        console.error(`[OverdueReminders] Customer ${customer.id} failed:`, error);
      }
    }
    // Failed customers retry on later ticks; already-sent customers won't resend.
    if (!counts.failed && !counts.busy) {
      await storage.setAppSetting("overdue_reminder_completed_week", week);
    }
    console.log(`[OverdueReminders] Week ${week}: ${JSON.stringify(counts)}`);
  } finally {
    // Keep a 15-minute retry cooldown rather than hammering unavailable providers.
    await db.execute(sql`
      UPDATE app_settings
      SET value = ${JSON.stringify({ owner: "", leaseUntil: Date.now() + 15 * 60 * 1000 })},
          updated_at = NOW()
      WHERE key = ${`overdue_reminder_scan_${week}`}
        AND value::jsonb->>'owner' = ${owner}
    `);
  }
}

/** Existing app timers: due Mondays 08:00 UK; catch up within the current week. */
export function scheduleOverdueInvoiceReminders(): void {
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production") {
    console.log("[OverdueReminders] Development — email scheduler disabled.");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running || !overdueReminderWeek()) return;
    running = true;
    try {
      await runOverdueInvoiceReminders();
    } catch (error) {
      console.error("[OverdueReminders] Scheduler failed:", error);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, 60 * 1000);
  console.log("[OverdueReminders] Due Mondays 08:00 Europe/London; catches up when app is awake.");
}