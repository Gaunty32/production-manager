export const FINISHED_PHOTO_PREFIX = "Finished item — ";
export const MAX_FINISHED_PHOTO_BYTES = 10 * 1024 * 1024;
export const FINISHED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isFinishedPhoto(file: { uploadedBy: string; fileName: string; fileType: string }) {
  return file.uploadedBy === "staff" && file.fileName.startsWith(FINISHED_PHOTO_PREFIX)
    && FINISHED_PHOTO_TYPES.some(type => type === file.fileType);
}

export function photoBytesMatchType(bytes: Buffer, type: string) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}
