export const RECOVERED_LABEL_PREFIX = "abode-recovered-label:";

export async function verifyRecoveredLabelPdf(bytes: Buffer, orderNumber: string, trackingNumber: string) {
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Choose the existing DPD label as a PDF no larger than 1 MB.");
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true }).promise;
  try {
    if (document.numPages > 5) throw new Error("Choose the individual order's DPD label PDF.");
    let text = "";
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      text += " " + content.items.map(item => "str" in item ? item.str : "").join(" ");
    }
    const contains = (value: string) => {
      const pattern = Array.from(value).map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
      return new RegExp(`(^|[^A-Za-z0-9])${pattern}([^A-Za-z0-9]|$)`).test(text);
    };
    if (!contains(orderNumber) || !contains(trackingNumber)) {
      throw new Error("This PDF does not match the order and tracking number. Nothing has been saved.");
    }
  } finally {
    await document.destroy();
  }
}
