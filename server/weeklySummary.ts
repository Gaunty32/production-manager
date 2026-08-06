import { storage } from "./storage";
import { sendWeeklySummaryEmail, type WeeklySummaryMetric, type WeeklySummaryTeamRow } from "./emailService";
import { claimSlot } from "./inactiveCustomers";

const RECIPIENTS = [
  "james@selectbranding.co.uk",
  "chris@selectbranding.co.uk",
  "anna@selectuniforms.co.uk",
];

const ROLLING_WEEKS = 16;

/** Date in London as a yyyy-mm-dd string plus weekday/hour. */
function londonNow() {
  const london = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  return london;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing d (weeks run Monday to Sunday). */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  const dow = (out.getDay() + 6) % 7; // 0 = Monday
  out.setDate(out.getDate() - dow);
  out.setHours(0, 0, 0, 0);
  return out;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

export async function buildAndSendWeeklySummary(): Promise<void> {
  const now = londonNow();
  const thisMonday = mondayOf(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(lastSunday.getDate() - 1);
  const rangeStart = new Date(thisMonday);
  rangeStart.setDate(rangeStart.getDate() - 7 * ROLLING_WEEKS);

  const data = await storage.getWeeklyOutputReport({
    startDate: toDateKey(rangeStart),
    endDate: toDateKey(lastSunday),
    timezone: "Europe/London",
  });

  const weeks = data.weeks;
  const lastWeekKey = toDateKey(lastMonday);
  const lastWeek = weeks.find(w => w.weekStart === lastWeekKey) ?? {
    weekStart: lastWeekKey, submitted: 0, completed: 0, submittedQty: 0, completedQty: 0,
    avgLogoPrice: null, invValue: 0, invQty: 0, customersSubmitted: 0, customersCompleted: 0,
  };

  const weeksAveraged = Math.max(weeks.length, 1);
  const avg = (pick: (w: typeof lastWeek) => number) =>
    weeks.reduce((s, w) => s + pick(w), 0) / weeksAveraged;

  // Average price per logo: weight by invoiced line items across the window
  const totalInvValue = weeks.reduce((s, w) => s + (w.invValue || 0), 0);
  const totalInvQty = weeks.reduce((s, w) => s + (w.invQty || 0), 0);
  const avgLogoPriceWindow = totalInvQty > 0 ? totalInvValue / totalInvQty : null;

  const customersLastWeek = Math.max(lastWeek.customersSubmitted, lastWeek.customersCompleted);
  const customersAvg = avg(w => Math.max(w.customersSubmitted, w.customersCompleted));
  const metrics: WeeklySummaryMetric[] = [
    { label: "Line items completed", headline: true, lastWeek: fmtInt(lastWeek.completedQty), average: fmtInt(avg(w => w.completedQty)), lastWeekValue: lastWeek.completedQty, averageValue: avg(w => w.completedQty) },
    { label: "Jobs completed", headline: true, lastWeek: fmtInt(lastWeek.completed), average: fmtInt(avg(w => w.completed)), lastWeekValue: lastWeek.completed, averageValue: avg(w => w.completed) },
    { label: "Customers ordering", headline: true, lastWeek: fmtInt(customersLastWeek), average: fmtInt(customersAvg), lastWeekValue: customersLastWeek, averageValue: customersAvg },
    { label: "Jobs submitted", lastWeek: fmtInt(lastWeek.submitted), average: fmtInt(avg(w => w.submitted)), lastWeekValue: lastWeek.submitted, averageValue: avg(w => w.submitted) },
    { label: "Line items submitted", lastWeek: fmtInt(lastWeek.submittedQty), average: fmtInt(avg(w => w.submittedQty)), lastWeekValue: lastWeek.submittedQty, averageValue: avg(w => w.submittedQty) },
    {
      label: "Average price per logo (ex VAT)",
      lastWeek: lastWeek.avgLogoPrice != null ? `£${lastWeek.avgLogoPrice.toFixed(2)}` : "–",
      average: avgLogoPriceWindow != null ? `£${avgLogoPriceWindow.toFixed(2)}` : "–",
      lastWeekValue: lastWeek.avgLogoPrice,
      averageValue: avgLogoPriceWindow,
    },
  ];

  // Team performance: line items completed per staff member — last week and
  // their weekly average across the whole window. Only current team members
  // (active staff) are listed; leavers keep their history but drop off here.
  const allStaff = await storage.getStaff();
  const activeStaffIds = new Set(allStaff.filter(s => s.active).map(s => s.id));
  const staffTotals = new Map<string, { name: string; lastWeek: number; total: number }>();
  for (const row of data.staffWeekly) {
    if (!activeStaffIds.has(row.staffId)) continue;
    let entry = staffTotals.get(row.staffId);
    if (!entry) {
      entry = { name: row.staffName, lastWeek: 0, total: 0 };
      staffTotals.set(row.staffId, entry);
    }
    entry.total += row.quantity;
    if (row.weekStart === lastWeekKey) entry.lastWeek += row.quantity;
  }
  const team: WeeklySummaryTeamRow[] = Array.from(staffTotals.values())
    .map(t => ({ name: t.name, lastWeek: t.lastWeek, average: t.total / weeksAveraged }))
    .sort((a, b) => b.lastWeek - a.lastWeek);

  // Machine performance: same shape, per machine
  const machineTotals = new Map<number, { name: string; lastWeek: number; total: number }>();
  for (const row of data.machineWeekly) {
    let entry = machineTotals.get(row.machineId);
    if (!entry) {
      entry = { name: row.machineName, lastWeek: 0, total: 0 };
      machineTotals.set(row.machineId, entry);
    }
    entry.total += row.quantity;
    if (row.weekStart === lastWeekKey) entry.lastWeek += row.quantity;
  }
  const machines: WeeklySummaryTeamRow[] = Array.from(machineTotals.values())
    .map(t => ({ name: t.name, lastWeek: t.lastWeek, average: t.total / weeksAveraged }))
    .sort((a, b) => b.lastWeek - a.lastWeek);

  const weekLabel = `w/c ${lastMonday.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  await sendWeeklySummaryEmail({
    to: RECIPIENTS,
    weekLabel,
    weeksAveraged,
    metrics,
    team,
    machines,
  });
  console.log(`[WeeklySummary] Sent for ${weekLabel} to ${RECIPIENTS.join(", ")}`);
}

/**
 * Monday 09:00 Europe/London. Durable slot in app_settings prevents
 * double-sends across restarts/instances; a restart later on Monday still
 * catches up (any tick on Monday from 09:00 sends if not yet sent that week).
 */
export function scheduleWeeklySummary() {
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production") {
    console.log("[WeeklySummary] Not in production — scheduler disabled");
    return;
  }
  const tick = async () => {
    const now = londonNow();
    const isMonday = now.getDay() === 1;
    if (!isMonday || now.getHours() < 9) return;
    const weekKey = toDateKey(mondayOf(now));
    try {
      if (await claimSlot("weekly_summary_last_week", weekKey)) {
        try {
          await buildAndSendWeeklySummary();
        } catch (err) {
          // Release the claim so a later tick retries this week's send
          await storage.setAppSetting("weekly_summary_last_week", `failed-${weekKey}`);
          throw err;
        }
      }
    } catch (err) {
      console.error("[WeeklySummary] Failed:", err);
    }
  };
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, 15 * 60 * 1000);
  console.log("[WeeklySummary] Scheduled — Mondays 09:00 Europe/London");
}
