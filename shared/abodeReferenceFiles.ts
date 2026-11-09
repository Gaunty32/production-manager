export const ABODE_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;

// OS/browser MIME labels and storage metadata can be missing or generic.
// Only these known file signatures may become customer-facing proofs.
export function abodeReferenceContentType(bytes: Uint8Array): string | null {
  const startsWith = (prefix: number[]) => bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
