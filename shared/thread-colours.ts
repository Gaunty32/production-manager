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
