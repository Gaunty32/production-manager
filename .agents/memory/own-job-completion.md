---
name: Own-job completion rule
description: Plain staff may only complete/record work on jobs allocated to them; managers bypass.
---

**Rule:** `checkOwnJobCompletion` (server/routes.ts) gates PATCH /api/job-line-items/:id (when completed===true) and POST /api/production-entries. Users with role staff must have a linked staff record equal to jobs.responsibleOperatorId; super_admin/admin/manager bypass. Any NEW completion/production-recording endpoint must call the same check.

**Why:** Owner requirement (Aug 2026): staff can see all jobs but only complete their own. Ownership = Stage 1 allocation (`responsibleOperatorId`), not line-item operatorId.

**How to apply:** The staff-facing jobs area is /my-queue (My jobs tab completable, All jobs tab read-only via GET /api/active-jobs-overview — that path is NOT under /api/jobs/:id because :id would swallow it; keep overview routes off the /api/jobs prefix).
