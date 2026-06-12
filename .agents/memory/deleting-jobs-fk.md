---
name: Deleting jobs (FK cascade behavior)
description: Which job-related rows cascade vs orphan when a job is deleted, and what cleanup must do explicitly.
---

When deleting a row from `jobs`:
- **Cascade (auto-deleted):** jobLineItems, jobSchedule, productionEntries, jobFiles, jobErrors.
- **Set-null (left orphaned):** job_messages.jobId, samples.jobId.

**Why:** job_messages.jobId is nullable to support direct (non-job) conversations, so its FK is `set null` not `cascade`. Deleting a job therefore leaves its chat history behind with a null jobId rather than removing it.

**How to apply:** Any bulk/job-purge code (e.g. the super_admin "Data Cleanup" of old completed+invoiced jobs in storage.deleteOldInvoicedJobs) must explicitly `db.delete(jobMessages).where(inArray(jobMessages.jobId, ids))` before deleting the jobs if it claims to remove chat history. samples are intentionally left (optional physical-sample records).
