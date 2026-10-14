import type { Customer, Job } from "@shared/schema";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function awaitingGarmentsReminderWeek(now = new Date()): string | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  const day = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  if (sinceMonday === 0 && Number(part("hour")) < 9) return null;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day.toISOString().slice(0, 10);
}

export function awaitingGarmentsSince(job: Pick<Job, "submittedAt" | "approvedAt">): Date | null {
  const dates = [job.submittedAt, job.approvedAt].filter(Boolean).map(value => new Date(value!).getTime());
  if (!dates.length || dates.some(value => !Number.isFinite(value))) return null;
  return new Date(Math.max(...dates));
}

export function needsAwaitingGarmentsReminder(
  job: Job,
  customer: Customer,
  hasLineItems: boolean,
  now = new Date(),
): boolean {
  const since = awaitingGarmentsSince(job);
  return customer.active && job.status === "production" && !job.completed
    && !job.rejectedAt && !job.goodsReceived && !job.dhlTrackingNumber
    && !["invoiced", "ready"].includes(job.invoiceStatus)
    && !(customer.requiresAdvancePayment && !job.paymentReceived)
    && !hasLineItems && !!since && now.getTime() - since.getTime() >= WEEK_MS;
}
