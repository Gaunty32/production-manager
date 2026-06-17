---
name: Machine ID validation cap
description: Why "Number must be less than or equal to 5" appeared when saving jobs/schedules, and the hardcoded-machine-count trap.
---

# "Number must be less than or equal to 5" on save

Symptom: saving a job line item / schedule / staff-machine allocation / production
entry fails with the Zod default error "Number must be less than or equal to 5".

Cause: every machineId field in `shared/schema.ts` was validated as
`z.number().int().min(1).max(5)` — a hardcoded assumption of only 5 machines.
The machines table is a real DB table that grows; machine id 6 = "Print"
(active). Any record referencing machine 6 failed validation. Fixed by dropping
the `.max(5)` cap (keep `.min(1)`).

**Lesson / how to apply:** never cap a foreign-key id (machineId, etc.) to a
fixed number in validation — the referenced table grows. Use `.min(1)` and let
the DB/FK enforce existence. If you ever see a "must be less than or equal to N"
error tied to an entity that has its own table, suspect a stale hardcoded count.
This is shared validation (client+server) — fixing schema fixes both, no DB
migration needed, but it must be republished to reach production.
