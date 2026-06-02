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
**Never proxy file bytes through the server. Upload the browser → object storage
directly via a presigned PUT URL.** This bypasses Cloud Run entirely and supports
large files. This pattern is the norm across this codebase (profile pics,
`StaffJobFileUpload.tsx`, samples):

1. `POST /api/customer-portal/objects/upload` → `{ url, key }`
   (staff: `POST /api/staff/objects/upload` → `{ uploadURL, url, key }`).
   These call `ObjectStorageService.getObjectEntityUploadURLWithKey()`.
2. `fetch(url, { method: "PUT", body: file, headers: { "Content-Type": ... } })`
   straight to `storage.googleapis.com`.
3. Persist/normalize the returned `key` (`/objects/...`). For inline display it's
   converted to `/api/img/...` (strip `/objects` prefix).

**Why:** direct-to-GCS has no ~32MB ceiling and CORS works fine on Replit buckets
(this pattern is already live in production here). Old code comments claiming
"upload through server to avoid CORS issues" are misleading — direct PUT works.

## Gotchas
- `apiRequest` throws on non-2xx, so it can't surface a 401 for session-expiry.
  In customer flows use a **raw `fetch`** to the `objects/upload` route so you can
  check `status === 401` and route to login.
- The legacy server-proxy routes still exist: `/api/customer-portal/upload-file`
  and `/api/staff/upload-file` (`express.raw`). They are Cloud-Run-capped — do not
  reuse them for new upload flows; prefer the presigned routes above.
- A per-file `AbortController` timeout (~15 min) on the PUT is only a last-resort
  net; keep it generous so big files on slow/mobile connections still finish.
