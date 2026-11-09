import { ABODE_REFERENCE_MAX_BYTES, abodeReferenceContentType } from "@shared/abodeReferenceFiles";

export async function inspectAbodeReferenceFile(file: File): Promise<string> {
  if (!file.size) throw new Error("The selected file is empty. Choose the PDF printout or an image.");
  if (file.size > ABODE_REFERENCE_MAX_BYTES) throw new Error("This file is larger than 10 MB. Choose a smaller PDF or image.");
  const type = abodeReferenceContentType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type) {
    if (/\.emb$/i.test(file.name)) throw new Error("EMB files need embroidery software. Upload the PDF printout or an image for the customer to review.");
    throw new Error("This file is not a readable PDF, JPEG, PNG or WebP. Choose the PDF printout or an image.");
  }
  return type;
}

export async function uploadAbodeReferenceFile(
  file: File, { fallbackUrl, headers = {} }: { fallbackUrl: string; headers?: Record<string, string> },
  request: typeof fetch = fetch,
): Promise<string> {
  const type = await inspectAbodeReferenceFile(file);
  const readResponse = async (response: Response) => {
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your session has expired. Sign in again before retrying.");
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${response.status}). Please retry.`);
    }
    return response.json();
  };
  const signed = await readResponse(await request("/api/staff/objects/upload", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  if (!signed.url || !signed.key) throw new Error("The upload could not be prepared. Please retry.");
  try {
    const response = await request(signed.url, {
      method: "PUT", credentials: "omit", body: file, headers: { "Content-Type": type },
    });
    if (response.ok) return signed.key;
  } catch { /* Use the bounded same-origin backup if storage is unreachable. */ }
  const stored = await readResponse(await request(fallbackUrl, {
    method: "POST", credentials: "include", body: file, headers: { ...headers, "Content-Type": type },
  }));
  if (!stored.key) throw new Error("The upload did not return a saved file. Please retry.");
  return stored.key;
}
