---
name: Customer portal file uploads
description: Why customer job-attachment uploads can "hang forever" and how the upload flow is guarded.
---

# Customer portal attachment uploads

Customer attachments upload via `fetch` POST to `/api/customer-portal/upload-file`
(raw binary body), which server-side uses `express.raw({ limit: "50mb" })`. The
attach-to-job step (`/jobs/:id/files`) runs separately after job creation.

## The "spinning wheel of doom"
**Symptom:** dropzone spinner (`isUploading`) spins forever; nothing appears in
deployment logs.

**Why:** Express only logs a request line when the response *finishes*. If a file
exceeds the 50MB `express.raw` limit, the server stops reading the stream and tries
to respond while the browser is still uploading — the connection stalls, `fetch`
never settles, and no completion log is emitted. So an absent log line is itself a
signal of a hung (never-completed) request, not a missing one.

## Guard (must keep in lockstep)
The client `MAX_UPLOAD_BYTES` size check **must match** the server `express.raw`
limit. If you change one, change the other. Oversized files are rejected client-side
with a toast *before* any upload starts, so the doomed-upload stall never happens.
A per-file `AbortController` timeout (currently 15 min) is only a last-resort safety
net — keep it generous so large files on slow/mobile connections still succeed; it
is not the primary safeguard.

**Why generous:** a short hard timeout (e.g. 2 min) aborts legitimate large uploads
on mobile/slow upstream — a real regression.
