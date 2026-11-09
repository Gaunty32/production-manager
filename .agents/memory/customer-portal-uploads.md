---
name: File uploads (customer + staff)
description: Why uploads hang/fail in the published app and the deploy-safe upload pattern to use.
---

# File uploads — the deploy-time 32MB ceiling

This app deploys on **Replit Autoscale = Google Cloud Run**, which enforces a
**hard ~32MB request body limit** that you cannot raise. Any upload routed
*through the Express server* (a server proxy route that receives the file bytes,
e.g. `express.raw`) is capped by this, regardless of the `express.raw({ limit })`
value. Files over ~32MB are rejected by the Cloud Run proxy **before reaching
Express**.

## Why it's so hard to diagnose
**No server-side error is logged** for the failed upload, because the request
never reaches the Express handler — so there is no "Error uploading" 500 and no
completion log line. An *absent* upload log during a reported failure is itself
the signal that the request died at the infrastructure layer (Cloud Run), not in
your code. Symptoms differ by client: an old `fetch` with no error path **hangs**
(customer "spinning wheel of doom"); a client that throws on network failure
shows a generic **"Failed to upload" toast** (staff chat).

## The fix / the pattern to always use
**Default to browser → object storage directly via a presigned PUT URL;
never proxy unbounded or large uploads through the server.** This bypasses Cloud Run entirely and supports
large files. The bounded Abode PDF exception is described below. Direct upload is the norm across this codebase (profile pics,
`StaffJobFileUpload.tsx`, samples):

1. `POST /api/customer-portal/objects/upload` → `{ url, key }`
   (staff: `POST /api/staff/objects/upload` → `{ uploadURL, url, key }`).
   These call `ObjectStorageService.getObjectEntityUploadURLWithKey()`.
2. `fetch(url, { method: "PUT", body: file, headers: { "Content-Type": ... } })`
   straight to `storage.googleapis.com`.
3. Persist/normalize the returned `key` (`/objects/...`). For inline display it's
   converted to `/api/img/...` (strip `/objects` prefix).

**Why:** direct-to-GCS has no ~32MB ceiling and is already used in production.
Do not assume every “Failed to fetch” is a bucket CORS problem: a browser or its
network can fail to reach storage even when signed URL creation, a separate
preflight, and a separate storage PUT all succeed.

## Bounded Abode reference-file exception

For Abode's small reference files (PDF delivery notes, digital samples and finished photos), a same-origin backup after direct-upload
failure is acceptable, with a hard **10 MB per request** ceiling enforced on
both client and server. Never increase this fallback to the platform ceiling or
reuse it for the app's general large-file uploads.

**Why:** A live batch failed in the browser after every signed upload URL was
issued successfully, before any note was saved. Separate storage connectivity
checks passed; the precise browser/network cause was not established. These
small PDFs need an upload path that does not require the browser to reach the
external storage host, and 10 MB stays safely below Cloud Run's request ceiling.

**How to apply:** Retain direct upload as the first choice and use the bounded
backup only for these small Abode reference files. Preserve order/stocking ownership checks and
reuse the saved object key when retrying attachment persistence.

## Gotchas
- Keep the PDF preview renderer compatible with the project's Node toolchain; review its engine requirement before updating, including minor releases.
  **Why:** PDF.js 5.7 and 6 require Node 22+, but 5.6 supports this project's Node 20. The proof-preview change must not silently force a runtime migration.
  **How to apply:** Use the compatible pinned release unless the runtime is deliberately upgraded, and verify the browser worker together with the renderer.
- Verify Abode proofs with a real PDF through the successful direct-upload path as well as the backup path; include absent/generic browser and storage MIME labels.
  **Why:** PNG-only testing with forced backup uploads passed while a user subsequently reported a valid embroidery-printout PDF being rejected. That incident's exact browser cause was not established.
  **How to apply:** Validate known file signatures, retain the original bytes, and never accept EMB source files as customer-readable proofs merely because a filename or MIME label claims they are PDFs.
- `apiRequest` throws on non-2xx, so it can't surface a 401 for session-expiry.
  In customer flows use a **raw `fetch`** to the `objects/upload` route so you can
  check `status === 401` and route to login.
- The legacy server-proxy routes still exist: `/api/customer-portal/upload-file`
  and `/api/staff/upload-file` (`express.raw`). They are Cloud-Run-capped — do not
  reuse them for new upload flows; prefer the presigned routes above.
- A per-file `AbortController` timeout (~15 min) on the PUT is only a last-resort
  net; keep it generous so big files on slow/mobile connections still finish.
