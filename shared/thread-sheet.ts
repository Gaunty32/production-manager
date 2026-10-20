import { threadColourKey } from "./thread-colours";

export const THREAD_SHEET_TABS = ["Classic 40", "Classic 60", "Poly Neon 60"] as const;
export type ThreadSheetColours = Record<string, string[]>;

/** The most recent daily 08:00 UK checkpoint, including GMT/BST changes. */
export function threadSheetPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const day = new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);
  if (Number(part("hour")) < 8) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function threadSheetSyncDue(syncedAt: string | null, now = new Date()): boolean {
  return !syncedAt || !Number.isFinite(Date.parse(syncedAt))
    || threadSheetPeriod(new Date(syncedAt)) < threadSheetPeriod(now);
}

export function filterListedThreadColours<T extends { chart: string; code: string }>(
  colours: T[], sheet: ThreadSheetColours,
): T[] {
  const allowed = new Set(Object.entries(sheet).flatMap(([chart, codes]) =>
    codes.map(code => threadColourKey(chart, code)),
  ));
  return colours.filter(colour => allowed.has(threadColourKey(colour.chart, colour.code)));
}

export function parseThreadSheetResponse(data: unknown): ThreadSheetColours {
  const response = data as {
    error?: { message?: string };
    valueRanges?: { values?: unknown[][] }[];
  } | null;
  if (response?.error) throw new Error(response.error.message || "Google Sheet read failed");
  if (!Array.isArray(response?.valueRanges) || response.valueRanges.length !== THREAD_SHEET_TABS.length) {
    throw new Error("Google Sheet did not return all three thread tabs");
  }
  return Object.fromEntries(THREAD_SHEET_TABS.map((tab, index) => {
    const rows = response.valueRanges![index]?.values ?? [];
    if (!Array.isArray(rows)) throw new Error(`Invalid data for thread tab ${tab}`);
    // Madeira codes are numeric; ignore column headings and blank rows.
    const codes = rows.map(row => String(row?.[0] ?? "").trim()).filter(code => /^\d+$/.test(code));
    return [tab, Array.from(new Set(codes))];
  }));
}
