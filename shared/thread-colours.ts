/** Keep ranges distinct: the same code may refer to different threads. */
export function threadColourKey(chart: string, code: string): string {
  const range = chart.trim().toLowerCase()
    .replace(/^madeira\s+/, "")
    .replace(/[^a-z0-9]/g, "");
  return `${range}:${code.trim()}`;
}

export function indexThreadColours<T extends { chart: string; code: string }>(
  colours: readonly T[],
): Map<string, T> {
  return new Map(colours.map(colour => [
    threadColourKey(colour.chart, colour.code), colour,
  ]));
}

export function getThreadRangeLabel(chart: string): string {
  const range = threadColourKey(chart, "").split(":")[0];
  switch (range) {
    case "classic40": return "Classic 40";
    case "classic60": return "Classic 60";
    case "polyneon60": return "PolyNeon60";
    default: return chart.replace(/^madeira\s+/i, "").trim();
  }
}

export function compareThreadCodes(
  a: { code: string; chart: string }, b: { code: string; chart: string },
): number {
  return a.code.localeCompare(b.code, "en", { numeric: true })
    || getThreadRangeLabel(a.chart).localeCompare(getThreadRangeLabel(b.chart), "en", { numeric: true });
}
