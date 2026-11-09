import assert from "node:assert/strict";
import { test } from "node:test";
import { DELIVERY_NOTE_PREFIX, deliveryNoteOrderNumber, hasPdfSignature, isSuppliedDeliveryNote } from "./abodeDeliveryNotes";

test("delivery-note filenames match whole order numbers, including supplied examples", () => {
  for (const number of ["88423501", "88410433", "88409392", "88417357", "000123", "TEST-1"]) {
    assert.equal(deliveryNoteOrderNumber(`dispatch-note-${number}.pdf`), number);
    assert.equal(deliveryNoteOrderNumber(`dispatch-note-${number}_1794234721121.pdf`), number);
  }
  assert.equal(deliveryNoteOrderNumber("DELIVERY-NOTE-88423501.PDF"), "88423501");
  assert.equal(deliveryNoteOrderNumber("random-88423501.pdf"), null);
  assert.equal(deliveryNoteOrderNumber("dispatch-note-.pdf"), null);
  assert.equal(deliveryNoteOrderNumber("dispatch-note-88423501.png"), null);
  assert.equal(deliveryNoteOrderNumber("dispatch-note-884235010.pdf"), "884235010");
});

test("only purpose-tagged staff/customer PDFs are delivery notes", () => {
  const note = { fileName: `${DELIVERY_NOTE_PREFIX}dispatch-note-88423501.pdf`, fileType: "application/pdf", uploadedBy: "customer" };
  assert.equal(isSuppliedDeliveryNote(note), true);
  assert.equal(isSuppliedDeliveryNote({ ...note, uploadedBy: "staff" }), true);
  assert.equal(isSuppliedDeliveryNote({ ...note, fileType: "image/png" }), false);
  assert.equal(isSuppliedDeliveryNote({ ...note, fileName: "ordinary-artwork.pdf" }), false);
  assert.equal(hasPdfSignature(Buffer.from("%PDF-1.7\n")), true);
  assert.equal(hasPdfSignature(Buffer.from("<html>")), false);
  assert.equal(hasPdfSignature(Buffer.alloc(0)), false);
});
