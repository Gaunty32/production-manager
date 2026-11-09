export const DELIVERY_NOTE_PREFIX = "Supplied delivery note — ";
export const MAX_DELIVERY_NOTE_BYTES = 10 * 1024 * 1024;

export function deliveryNoteOrderNumber(fileName: string): string | null {
  // The optional timestamp is added to examples attached through chat.
  // Match a whole filename/order number, never a substring of another order.
  const match = /^(?:dispatch|delivery)[-_ ]note[-_ ](.+?)(?:_\d{13})?\.pdf$/i.exec(fileName.trim());
  return match?.[1]?.trim() || null;
}

export function isSuppliedDeliveryNote(file: { fileName: string; fileType: string; uploadedBy: string }) {
  return file.fileType === "application/pdf" && file.fileName.startsWith(DELIVERY_NOTE_PREFIX)
    && ["staff", "customer"].includes(file.uploadedBy);
}

export function hasPdfSignature(bytes: Buffer) {
  return bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
}
