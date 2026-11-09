export async function uploadAbodeReferenceFile(
  file: File, { fallbackUrl, headers = {} }: { fallbackUrl: string; headers?: Record<string, string> },
): Promise<string> {
  const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "");
  if (!file.size || file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(type)) {
    throw new Error("Choose a JPEG, PNG, WebP or PDF up to 10 MB.");
  }
  const readResponse = async (response: Response) => {
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your session has expired. Sign in again before retrying.");
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${response.status}). Please retry.`);
    }
    return response.json();
  };
  const signed = await readResponse(await fetch("/api/staff/objects/upload", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  try {
    const response = await fetch(signed.url, {
      method: "PUT", credentials: "omit", body: file, headers: { "Content-Type": type },
    });
    if (response.ok) return signed.key;
  } catch { /* Use the bounded same-origin backup if storage is unreachable. */ }
  const stored = await readResponse(await fetch(fallbackUrl, {
    method: "POST", credentials: "include", body: file, headers: { ...headers, "Content-Type": type },
  }));
  if (!stored.key) throw new Error("The upload did not return a saved file. Please retry.");
  return stored.key;
}
