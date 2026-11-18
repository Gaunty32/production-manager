import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAbodeImportFiles } from "./abodeImportFiles";

test("one sheet and multiple PDFs can be selected together, in any order", () => {
  for (const extension of ["xlsx", "xls", "csv"]) {
    const sheet = { name: `orders.${extension}` };
    const notes = [{ name: "dispatch-note-12345678.pdf" }, { name: "dispatch-note-87654321.PDF" }];
    assert.deepEqual(splitAbodeImportFiles([notes[0], sheet, notes[1]]), { sheet, notes });
  }
});

test("PDF-only additions do not select or replace an order sheet", () => {
  const notes = [{ name: "dispatch-note-12345678.pdf" }];
  assert.deepEqual(splitAbodeImportFiles(notes), { sheet: undefined, notes });
  assert.deepEqual(splitAbodeImportFiles([]), { sheet: undefined, notes: [] });
});

test("a sheet can still be selected without delivery notes", () => {
  const sheet = { name: "ORDERS.XLSX" };
  assert.deepEqual(splitAbodeImportFiles([sheet]), { sheet, notes: [] });
});

test("multiple sheets and unsupported files are rejected before queue changes", () => {
  assert.throws(() => splitAbodeImportFiles([{ name: "a.csv" }, { name: "b.xlsx" }]), /only one/);
  assert.throws(() => splitAbodeImportFiles([{ name: "a.xlsx" }, { name: "note.png" }]), /PDF delivery notes only/);
});
