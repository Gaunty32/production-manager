/** Reject ambiguous selections before changing the current import queue. */
export function splitAbodeImportFiles<T extends { name: string }>(files: T[]) {
  const sheets = files.filter(file => /\.(xlsx|xls|csv)$/i.test(file.name));
  const notes = files.filter(file => /\.pdf$/i.test(file.name));
  if (sheets.length > 1) throw new Error("Choose only one Excel or CSV order sheet, together with any delivery-note PDFs.");
  if (sheets.length + notes.length !== files.length) throw new Error("Choose an Excel or CSV order sheet and PDF delivery notes only.");
  return { sheet: sheets[0], notes };
}
