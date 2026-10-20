import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListedThreadColours, filterListedThreadColours, parseThreadSheetResponse, threadSheetPeriod, threadSheetSyncDue,
} from "./thread-sheet";
import { compareThreadCodes, getThreadRangeLabel } from "./thread-colours";
import type { ThreadColour } from "./schema";

test("8am UK cutoff follows summer and winter time, including clock changes", () => {
  assert.equal(threadSheetPeriod(new Date("2026-07-10T06:59:59Z")), "2026-07-09");
  assert.equal(threadSheetPeriod(new Date("2026-07-10T07:00:00Z")), "2026-07-10");
  assert.equal(threadSheetPeriod(new Date("2026-12-10T07:59:59Z")), "2026-12-09");
  assert.equal(threadSheetPeriod(new Date("2026-12-10T08:00:00Z")), "2026-12-10");
  assert.equal(threadSheetPeriod(new Date("2026-03-29T07:00:00Z")), "2026-03-29");
  assert.equal(threadSheetPeriod(new Date("2026-10-25T07:59:59Z")), "2026-10-24");
  assert.equal(threadSheetPeriod(new Date("2026-10-25T08:00:00Z")), "2026-10-25");
  assert.equal(threadSheetPeriod(new Date("2026-01-01T07:00:00Z")), "2025-12-31");
});

test("daily reads are reused until 8am; startup and missed-day catch-up are due", () => {
  const synced = "2026-10-19T07:00:30Z";
  assert.equal(threadSheetSyncDue(synced, new Date("2026-10-20T06:59:59Z")), false);
  assert.equal(threadSheetSyncDue(synced, new Date("2026-10-20T07:00:00Z")), true);
  assert.equal(threadSheetSyncDue(synced, new Date("2026-10-22T17:00:00Z")), true);
  assert.equal(threadSheetSyncDue(null), true);
  assert.equal(threadSheetSyncDue("invalid"), true);
  assert.equal(threadSheetSyncDue("2026-10-20T06:00:00Z", new Date("2026-10-20T07:00:00Z")), true);
});

test("all three tabs are parsed, codes deduplicated and headings ignored", () => {
  assert.deepEqual(parseThreadSheetResponse({ valueRanges: [
    { values: [["Colour code"], [" 1010 "], ["1010"], [""], ["1123"]] },
    { values: [["1011"]] }, { values: [["1557"]] },
  ] }), { "Classic 40": ["1010", "1123"], "Classic 60": ["1011"], "Poly Neon 60": ["1557"] });
});

test("partial reads and API errors are failures, not an empty replacement list", () => {
  assert.throws(() => parseThreadSheetResponse({ error: { message: "Permission denied" } }), /Permission denied/);
  assert.throws(() => parseThreadSheetResponse({ valueRanges: [{ values: [["1010"]] }] }), /all three/);
  assert.throws(() => parseThreadSheetResponse({}), /all three/);
  assert.deepEqual(parseThreadSheetResponse({ valueRanges: [{}, {}, {}] }), {
    "Classic 40": [], "Classic 60": [], "Poly Neon 60": [],
  });
});

test("only listed chart/code pairs are shown, including removals and empty lists", () => {
  const colours = [
    { chart: "Madeira Classic 40", code: "1010" },
    { chart: "Madeira Classic 40", code: "1123" },
    { chart: "Madeira Classic 60", code: "1010" },
    { chart: "Madeira PolyNeon 60", code: "1557" },
  ];
  assert.deepEqual(filterListedThreadColours(colours, {
    "Classic 40": ["1010"], "Classic 60": [], "Poly Neon 60": ["1557"],
  }), [colours[0], colours[3]]);
  assert.deepEqual(filterListedThreadColours(colours, { "Classic 40": [] }), []);
});

test("customer catalogue includes every listed code but never invents missing shades", () => {
  const known: ThreadColour = {
    id: 1, code: "1010", chart: "Madeira Classic 40", name: "Gray Haze", flag: "A",
    r: 192, g: 199, b: 193, createdAt: new Date(),
  };
  const result = buildListedThreadColours([known, { ...known, code: "9999" }], {
    "Classic 40": ["1010", "1010"], "Classic 60": ["1010"], "Poly Neon 60": ["1557"],
  });
  assert.equal(result.length, 3);
  assert.equal(result.find(c => c.chart === "Classic 40")?.colour?.name, "Gray Haze");
  assert.equal(result.find(c => c.chart === "Classic 60")?.colour, null);
  assert.equal(result.find(c => c.chart === "Poly Neon 60")?.colour, null);
  assert.equal(result.some(c => c.code === "9999"), false);
});

test("range labels and numerical ordering are customer friendly", () => {
  assert.equal(getThreadRangeLabel("Madeira Classic 40"), "Classic 40");
  assert.equal(getThreadRangeLabel("Classic 60"), "Classic 60");
  assert.equal(getThreadRangeLabel("Poly Neon 60"), "PolyNeon60");
  assert.equal(getThreadRangeLabel("Madeira PolyNeon 60"), "PolyNeon60");
  const sorted = ["100", "20", "3"].map(code => ({ chart: "Classic 40", code })).sort(compareThreadCodes);
  assert.deepEqual(sorted.map(c => c.code), ["3", "20", "100"]);
  assert.deepEqual([...sorted].reverse().map(c => c.code), ["100", "20", "3"]);
});
