---
name: Customer submission idempotency
description: Reliability rules preventing duplicate customer jobs and file links after retries, reloads, or concurrent requests.
---

Customer job submissions must carry a stable, payload-specific idempotency key
that survives a page reload until the server confirms the job.

**Why:** A request can commit successfully while its response is lost. Treating
the retry as a new submission creates a duplicate, and an in-memory key does not
survive the customer refreshing after an ambiguous error.

**How to apply:** Persist the draft key in browser session storage, enforce it
with a database uniqueness constraint, recover unique conflicts by returning
the existing job, and clear the key only after confirmed creation.

Job-number allocation and uploaded-file linking must also be serialized or
uniquely constrained at the database boundary.

**Why:** Check-then-insert logic and MAX+1 numbering race under simultaneous
requests even when the UI normally disables repeated clicks.

**How to apply:** Keep job-number generation under its transaction lock and use
atomic conflict-safe inserts for job attachments. Never report attachment
failure as job-creation failure after the job has committed.