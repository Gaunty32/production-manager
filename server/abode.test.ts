import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseStockingRows } from "./abodeImport";
import { isAbodeCustomer, stockingRate, stockingShippingRoute, stockingBagNetworkCode, stockingFontLabel } from "../shared/abode";
import { billedQuantityForMatchingLine, calculateJobPrice } from "../shared/pricing";
import { renderStockingDeliveryNote, renderStockingLabel } from "./abodeDocuments";
import { getDpdTrackingUrl } from "../shared/dpd-tracking";
import { insertJobLineItemSchema, updateJobLineItemSchema } from "../shared/schema";

const row = {
  "Order number": "000123", "Stocking colour": "Red", Font: "Font 1", "Thread colour": "Gold",
  Name: "McDONALD  Jr", "Delivery name": "Test Recipient", "Address line 1": "1 Test Street",
  "Address line 2": "", Town: "London", County: "", Postcode: "SW1A 1AA",
};
test("stocking font labels show the supplied production names without changing unknown values", () => {
  assert.equal(stockingFontLabel("Font 1"), "Font 1 — Sad Night Script Regular");
  assert.equal(stockingFontLabel("Font 2"), "Font 2 — Tabac G3 Semibold");
  assert.equal(stockingFontLabel("Font 3"), "Font 3 — Stolen Times Italic");
  assert.equal(stockingFontLabel("  font 2  "), "Font 2 — Tabac G3 Semibold");
  assert.equal(stockingFontLabel("3"), "Font 3 — Stolen Times Italic");
  assert.equal(stockingFontLabel("Font 4"), "Font 4");
  assert.equal(stockingFontLabel("Sad Night Script Regular"), "Sad Night Script Regular");
  assert.equal(stockingFontLabel(""), "");
});
test("uploaded first order contains 33 stockings grouped into 15 independent jobs", t => {
  const file = "attached_assets/Select_Branding_Stocking_Orders_06.11.26_1793983854505.csv";
  // The customer's private source upload is deliberately not a public fixture.
  if (!existsSync(file)) return t.skip("Private source spreadsheet is not present");
  const wb = XLSX.read(readFileSync(file), { type: "buffer", raw: false });
  const orders = parseStockingRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" }));
  assert.equal(orders.length, 15);
  assert.equal(orders.reduce((n, o) => n + o.items.length, 0), 33);
  assert.equal(orders.find(o => o.orderNumber === "88140527")?.items.length, 3);
  assert.ok(orders.every(o => o.shippingRoute === "dpd"));
});
test("imports preserve case, internal spaces and leading-zero order numbers", () => {
  const [order] = parseStockingRows([row]);
  assert.equal(order.orderNumber, "000123");
  assert.equal(order.items[0].name, "McDONALD  Jr");
  assert.equal(order.items[0].font, "Font 1");
  assert.equal(order.items[0].thread, "Gold");
});
test("reordered sheets dedupe, identical names remain separate stockings, conflicts fail", () => {
  const other = { ...row, Name: "JANE" };
  assert.equal(parseStockingRows([row, other])[0].importHash, parseStockingRows([other, row])[0].importHash);
  assert.equal(parseStockingRows([row, row])[0].items.length, 2);
  assert.throws(() => parseStockingRows([row, { ...row, Postcode: "EH30 9TT" }]), /conflicting/);
  assert.throws(() => parseStockingRows([{ ...row, Name: "" }]), /Name/);
  assert.throws(() => parseStockingRows([]));
});
test("remote areas route to Royal Mail while central Scotland and mainland remain DPD", () => {
  for (const postcode of ["SW1A 1AA", "EH30 9TT", "G1 1AA", "CF10 1AA", "AB10 1AA"]) {
    assert.equal(stockingShippingRoute(postcode), "dpd", postcode);
  }
  for (const postcode of ["IV1 1AA", "HS1 2AA", "ZE1 0AA", "KW15 1AA", "PA80 5AA", "PH45 1AA", "AB31 5AA", "AB42 1AA", "FK17 8AA", "BT1 1AA", "IM1 1AA", "JE1 1AA", "GY1 1AA", "TR21 0AA", "PO30 1AA", "NOT UK", "D02X285"]) {
    assert.equal(stockingShippingRoute(postcode), "royal_mail", postcode);
  }
});
test("threshold changes at stocking 101 and never invokes the standard minimum order", () => {
  assert.equal(stockingRate(99), 7);
  assert.equal(stockingRate(100), 5);
  const items = [7, 5, 5].map(agreedUnitPrice => ({
    quantity: 1, stitchCount: 0, jobType: "Embroidery Initials/Name",
    stockingDetails: { colour: "Red", font: "Font 1", thread: "Gold", name: "Exact CAPS" }, agreedUnitPrice,
  }));
  const price = calculateJobPrice(items);
  assert.equal(price.totalPrice, 17);
  assert.deepEqual(price.lineItemPrices.map(p => p.unitPrice), [7, 5, 5]);
  assert.deepEqual(items.map((_, i) => billedQuantityForMatchingLine(items, i)), [1, 1, 1]);
  assert.equal(calculateJobPrice([{ ...items[0], agreedUnitPrice: null }]).totalPrice, "POA");
});
test("DPD bags select Expresspak rather than the default parcel service", () => {
  assert.equal(stockingBagNetworkCode(500), "2^68");
  assert.equal(stockingBagNetworkCode(1000), "2^68");
  assert.equal(stockingBagNetworkCode(1001), "2^32");
  assert.equal(stockingBagNetworkCode(5000), "2^32");
  assert.throws(() => stockingBagNetworkCode(5001), /5kg/);
});
test("other customers retain normal pricing and cannot submit their own stocking prices", () => {
  assert.equal(isAbodeCustomer({ name: "Another customer" }), false);
  assert.equal(isAbodeCustomer({ name: "Abode Home & Gifts" }), true);
  const ordinary = [{ quantity: 1, stitchCount: 5000, jobType: "Embroidery" }];
  assert.equal(billedQuantityForMatchingLine(ordinary, 0, new Date("2026-11-06")), 6);
  const parsed = insertJobLineItemSchema.parse({
    jobId: "test", quantity: 1, stitchCount: 0, stockingDetails: { name: "bad" }, agreedUnitPrice: 0,
  });
  assert.ok(!("stockingDetails" in parsed));
  assert.ok(!("agreedUnitPrice" in parsed));
  assert.deepEqual(updateJobLineItemSchema.parse({ agreedUnitPrice: 0 }), {});
});
test("delivery note preserves personalisation, branding and address, without prices or supplier", () => {
  const html = renderStockingDeliveryNote({
    brand: "Abode Home & Gifts", logoUrl: "https://example.com/logo.png", orderNumber: "<ORDER>",
    recipient: { name: "A & B", line1: "Test Street", line2: "", town: "London", county: "", postcode: "SW1A 1AA" },
    items: [{ colour: "Red", font: "Font 3", thread: "Gold", name: '<script>Exact CAPS</script>' }],
  });
  assert.ok(html.includes("&lt;script&gt;Exact CAPS&lt;/script&gt;"));
  assert.ok(html.includes("https://example.com/logo.png"));
  assert.ok(html.includes("Font 3"));
  assert.ok(!/Select Branding|£|unit.price|invoice/i.test(html));
  assert.throws(() => renderStockingDeliveryNote({
    brand: "Abode", logoUrl: "javascript:alert(1)", orderNumber: "1",
    recipient: {} as any, items: [],
  }), /logo/);
});
test("Royal Mail tracking never points to DPD; labels cannot execute courier scripts", () => {
  assert.ok(getDpdTrackingUrl({ shippingCarrier: "royal_mail", dhlTrackingNumber: "TESTGB" }).startsWith("https://www.royalmail.com/"));
  const html = renderStockingLabel('<script>alert("bad")</script><img onerror="alert(1)" src="x">', "nonce");
  assert.ok(html.includes('sandbox="allow-same-origin allow-modals"'));
  assert.ok(!html.includes("allow-scripts"));
  assert.ok(!html.includes("bad"));
  assert.ok(!html.includes("onerror"));
});
