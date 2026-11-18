import { inspectAbodeReferenceFile, uploadAbodeReferenceFile } from "./abodeReferenceUpload";

export async function uploadAbodeFinishedPhoto(
  file: File,
  { jobId, lineItemId }: { jobId: string; lineItemId: string },
  request: typeof fetch = fetch,
): Promise<void> {
  const type = await inspectAbodeReferenceFile(file);
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    throw new Error("Choose a JPEG, PNG or WebP photo.");
  }
  const base = `/api/abode/orders/${encodeURIComponent(jobId)}/photos`;
  const objectKey = await uploadAbodeReferenceFile(file, {
    fallbackUrl: `${base}/upload`,
    headers: { "x-line-item-id": lineItemId },
  }, request);
  const response = await request(base, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey, fileName: file.name, lineItemId }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session has expired. Sign in again before retrying.");
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "The photo could not be attached to this order. Please retry.");
  }
}
