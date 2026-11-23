type UploadOptions = { baseUrl: string; isStaff: boolean; jobId: string };

const preparedPdfs = new WeakMap<File, Promise<File>>();

/** Read while the drop/selection is fresh, not after a slow order import.
 * A File from Downloads/cloud storage can otherwise become unreadable later. */
export function prepareAbodeDeliveryNote(file: File): Promise<File> {
  const existing = preparedPdfs.get(file);
  if (existing) return existing;
  const prepared = (async () => {
    if (!file.size || file.size > 10 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) {
      throw new Error("Choose a PDF delivery note up to 10 MB.");
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      throw new Error("This PDF can no longer be read from your device. Download or save it locally, then drop or choose it again. Retrying alone cannot restore access. Your imported orders and labels are unchanged.");
    }
    if (bytes.byteLength !== file.size || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("File content is not a valid PDF. Choose the original delivery-note PDF again.");
    }
    const snapshot = new File([bytes], file.name, { type: "application/pdf", lastModified: file.lastModified });
    preparedPdfs.set(snapshot, Promise.resolve(snapshot));
    return snapshot;
  })();
  preparedPdfs.set(file, prepared);
  return prepared;
}

async function responseError(response: Response): Promise<Error> {
  if (response.status === 401) return new Error("Your session has expired. Sign in again before retrying the upload.");
  if (response.status === 413) return new Error("The PDF is too large. Choose a file up to 10 MB.");
  const body = await response.text();
  try {
    const result = JSON.parse(body);
    if (typeof result.error === "string") return new Error(result.error);
  } catch { /* Some network gateways return HTML rather than JSON. */ }
  return new Error(`The PDF upload failed (${response.status}). Please retry.`);
}

export async function uploadAbodeDeliveryNote(
  file: File, { baseUrl, isStaff, jobId }: UploadOptions, request: typeof fetch = fetch,
): Promise<string> {
  file = await prepareAbodeDeliveryNote(file);
  const signedResponse = await request(isStaff ? "/api/staff/objects/upload" : "/api/customer-portal/objects/upload", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  if (!signedResponse.ok) throw await responseError(signedResponse);
  const { url, key } = await signedResponse.json() as { url: string; key: string };
  if (!url || !key) throw new Error("The PDF upload could not be prepared. Please retry.");
  try {
    const uploaded = await request(url, {
      method: "PUT", credentials: "omit", body: file, headers: { "Content-Type": "application/pdf" },
    });
    if (uploaded.ok) return key;
  } catch {
    // Browsers hide CORS and network failures behind TypeError. The same-origin
    // fallback is safe here because PDFs have a hard 10 MB per-request ceiling.
  }
  let backup: Response;
  try {
    backup = await request(`${baseUrl}/delivery-notes/upload`, {
      method: "POST", credentials: "include", body: file,
      headers: {
        "Content-Type": "application/pdf", "x-file-name": encodeURIComponent(file.name), "x-job-id": jobId,
      },
    });
  } catch {
    throw new Error("The PDF could not reach storage or the app. Check your connection, then retry this file.");
  }
  if (!backup.ok) throw await responseError(backup);
  const saved = await backup.json() as { key: string };
  if (!saved.key) throw new Error("The backup upload did not return a saved file. Please retry.");
  return saved.key;
}
