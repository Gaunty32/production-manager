import shades from "./data/madeira-classic-40.json";
import type { ThreadColour } from "@shared/schema";
import { indexThreadColours, threadColourKey } from "../shared/thread-colours";

// From the user's Madeira_Classic_40_1792501845945.tch export.
// Bundle the supplied catalogue so publishing includes shades without a live DB import.
// Negative IDs cannot collide with database-generated IDs.
const suppliedColours: ThreadColour[] = shades.map((shade, index) => ({
  ...shade,
  id: -(index + 1),
  createdAt: new Date("2026-10-20T00:00:00Z"),
}));

export function withSuppliedThreadColours(imported: ThreadColour[]): ThreadColour[] {
  const combined = indexThreadColours(suppliedColours);
  // Later staff imports remain authoritative for their chart/code pair.
  for (const colour of imported) {
    combined.set(threadColourKey(colour.chart, colour.code), colour);
  }
  return Array.from(combined.values()).sort((a, b) =>
    a.code.localeCompare(b.code) || a.chart.localeCompare(b.chart),
  );
}
