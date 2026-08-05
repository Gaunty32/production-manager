---
name: Operator-led allocation (Stage 1)
description: How job ownership by operators works — status derivation, recommendation snapshot, permission model, TV workload strip.
---

Principle: people own jobs, machines provide capacity. `jobs` carries responsibleOperatorId, allocationStatus (unallocated|allocated|blocked), blockedReason, recommendedMachineId, machineOverrideReason, allocatedById/At. Existing `jobs.machineId` doubles as the CONFIRMED machine — do not add a second confirmed-machine column.

Rules:
- allocationStatus is DERIVED in `allocateJob` (blocked > allocated > unallocated); never set it directly from other write paths or it drifts.
- The machine recommendation is snapshotted at first allocation using the operator being set in that same request (pass the intended operator into `recommendMachineForJob`), otherwise the recommended-vs-overridden audit is computed against the stale operator.
- Historic jobs keep null operator — display "Historic allocation unavailable"; never backfill guesses.
- Permissions: allocation read+write routes (/api/allocation/*) are manager-gated (super_admin/admin/manager); /api/my-queue is any staff for their own queue only. The Allocation sidebar link is role-filtered to match.
- Active-job filter (board/queue/TV) mirrors the Production Queue: not completed, not pending_customer_approval, not invoiced/ready, advance-payment gate. Keep all consumers on `getActiveJobs()` in server/allocation.ts so they can't diverge.
- TV: operatorWorkload strip renders above Today's Plan; "Jobs with no owner" + "Blocked jobs" alerts derive from the same fields.

**Why:** code review found the stale-recommendation and staff-wide read-route issues on first build; both were fixed — don't reintroduce.
