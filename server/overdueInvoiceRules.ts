const DAY_MS = 24 * 60 * 60 * 1000;

/** Xero supplies ISO dates and legacy Microsoft JSON dates. */
export function parseXeroInvoiceDate(raw: string | null | undefined): number {
  if (!raw) return NaN;
  const match = raw.match(/\/Date\((-?\d+)([+-]\d+)?\)\//);
  return match ? Number(match[1]) : new Date(raw).getTime();
}

export function isOverdueInvoice(
  invoice: { Type?: string; Status: string; AmountDue?: number; Date: string },
  now = Date.now(),
): boolean {
  return (!invoice.Type || invoice.Type === "ACCREC") &&
    (invoice.Status === "AUTHORISED" || invoice.Status === "SUBMITTED") &&
    Number.isFinite(invoice.AmountDue) && (invoice.AmountDue ?? 0) > 0 &&
    now - parseXeroInvoiceDate(invoice.Date) > 30 * DAY_MS;
}

/** Current week's Monday, once Monday 08:00 UK time is due. No old-week backlog. */
export function overdueReminderWeek(now = new Date()): string | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const localDay = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const daysSinceMonday = (localDay.getUTCDay() + 6) % 7;
  if (daysSinceMonday === 0 && Number(part("hour")) < 8) return null;
  localDay.setUTCDate(localDay.getUTCDate() - daysSinceMonday);
  return localDay.toISOString().slice(0, 10);
}