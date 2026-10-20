import test from "node:test";
import assert from "node:assert/strict";
import { withSuppliedThreadColours } from "./threadColourCatalog";
import { indexThreadColours, threadColourKey } from "../shared/thread-colours";

test("the uploaded catalogue supplies all 387 valid shades without a database import", () => {
  const colours = withSuppliedThreadColours([]);
  assert.equal(colours.length, 387);
  assert.equal(new Set(colours.map(c => c.id)).size, 387);
  for (const colour of colours) {
    assert.equal(colour.chart, "Madeira Classic 40");
    assert.ok([colour.r, colour.g, colour.b].every(v =>
      Number.isInteger(v) && v >= 0 && v <= 255,
    ));
  }
  const byKey = indexThreadColours(colours);
  assert.deepEqual(
    (({ r, g, b }) => [r, g, b])(byKey.get(threadColourKey("Classic 40", "1123"))!),
    [253, 243, 191],
  );
  assert.equal(byKey.get(threadColourKey("Classic 40", "1088"))?.name, "Robin’s Egg");
});

test("sheet chart aliases match but other ranges never borrow Classic 40 shades", () => {
  const byKey = indexThreadColours(withSuppliedThreadColours([]));
  assert.ok(byKey.has(threadColourKey("Classic 40", "1010")));
  assert.equal(byKey.has(threadColourKey("Classic 60", "1010")), false);
  assert.equal(byKey.has(threadColourKey("Poly Neon 60", "1010")), false);
  assert.equal(
    threadColourKey("Madeira PolyNeon 60", " 1557 "),
    threadColourKey("Poly Neon 60", "1557"),
  );
});

test("staff-imported shades override bundled matches without losing other ranges", () => {
  const base = withSuppliedThreadColours([]).find(c => c.code === "1010")!;
  const custom = { ...base, id: 50, name: "Updated shade", r: 100 };
  const otherRange = { ...base, id: 51, chart: "Madeira Classic 60" };
  const colours = withSuppliedThreadColours([custom, otherRange]);
  const byKey = indexThreadColours(colours);
  assert.equal(colours.length, 388);
  assert.equal(byKey.get(threadColourKey("Classic 40", "1010"))?.id, 50);
  assert.equal(byKey.get(threadColourKey("Classic 40", "1010"))?.r, 100);
  assert.equal(byKey.get(threadColourKey("Classic 60", "1010"))?.id, 51);
});
