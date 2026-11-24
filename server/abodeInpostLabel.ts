export const INPOST_LABEL_PREFIX = "abode-inpost-label:";

/** An external label is evidence of a booking, never evidence of despatch. */
export async function verifyInpostLabelPdf(bytes: Buffer, recipient: { name: string; postcode: string }) {
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Choose the existing InPost label PDF, up to 1 MB.");
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true }).promise;
  try {
    if (document.numPages !== 1) throw new Error("Choose the single parcel's InPost label.");
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
    const normalise = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normalised = normalise(text);
    if (!/\binpost\b/i.test(text) || !normalise(recipient.name) || !normalise(recipient.postcode)
      || !normalised.includes(normalise(recipient.name)) || !normalised.includes(normalise(recipient.postcode))) {
      throw new Error("This InPost label does not match the order's recipient and postcode. Nothing has been saved.");
    }
  } finally {
    await document.destroy();
  }
}
