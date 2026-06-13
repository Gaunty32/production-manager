---
name: Auto-scheduling behavior & gotchas
description: How embroidery line items get booked onto production days, the two eligibility code paths that can drift, the single-flight lock, and the board-mount side-effect.
---

# Auto-scheduling production days

A line item only appears on the Machine Schedule / machine-sheet once it has a `job_schedule` row. Assigning a machine alone is NOT enough — something must book a slot.

Two code paths create those rows, and their eligibility rules must be kept in sync:
- `autoScheduleLineItem(lineItemId)` (server/routes.ts) — single-item, called on machine assignment. Already skips awaiting-advance-payment jobs.
- `POST /api/scheduling/auto-schedule` (bulk) — books every unscheduled, machine-assigned, non-completed embroidery line item via `findAvailableSlots` (most-efficient slot, respects all schedules/specs/shifts/holidays).

**Eligibility skips** (both paths should agree): completed jobs, invoiced jobs (`invoiceStatus` invoiced/ready or `invoicedAt` set), and `customer.requiresAdvancePayment && !job.paymentReceived`.
**Why:** awaiting-payment / invoiced jobs are not released to production; booking them clutters the board and steals slots.
**Drift risk:** the skip rules live in two places — change them together. Centralizing into one helper is a known TODO (architect-flagged).

## Single-flight lock
The bulk endpoint is guarded by a module-level `autoScheduleInProgress` flag. A second concurrent call returns `scheduledCount: 0, message: "Auto-scheduling already in progress"` instead of running.
**Why:** schedules are computed from a snapshot with no DB uniqueness on `job_schedule.line_item_id`; two overlapping runs would double-book. App runs as a single Node process, so an in-process flag is sufficient. A partial unique index (`WHERE status <> 'cancelled'`) would be the robust fix if multi-instance ever matters.

## Board-mount autofill (side-effect)
`MachineScheduleBoard.tsx` fires `POST /api/scheduling/auto-schedule` once on mount (useEffect + useRef guard), then invalidates the machine-sheet query if anything was scheduled. So **opening the Machine Schedule mutates production data** — intentional, per user request ("autofill the most efficient production day"). The useRef guard prevents StrictMode double-invoke.

## Operator = who's allocated to the machine THAT DAY
The operator on an auto-booked job must match the person allocated to that machine on the scheduled day (Staff Allocations), NOT just whoever is free.
**Why:** `getStaffMachineAllocationSlots` (shared/scheduling.ts) treats a staff member with *no allocation that day* as "free for any machine" (returns null = unrestricted). The old greedy "earliest available across all candidate staff" then grabbed an unrelated person (e.g. Mollie on Barudan 8) even though someone else (Dave) was allocated there that day. User confirmed: machine+staff is a combination — operator should be the day's allocated person.
**How it works now (bulk `POST /api/scheduling/auto-schedule`):** slot search is **date-first** — walk days from start; for each day pick eligible operators = staff allocated to that machine that day (prefer machine default if it's allocated that day); only if nobody is allocated fall back to default operator, then to any candidate staff (legacy no-allocation set-ups). Take earliest fitting slot. Default operator is looked up from the full `staff` list (not the allocation-filtered `candidateStaff`) so a machine default is honoured even without explicit allocation rows. The single-item `autoScheduleLineItem` still uses the simpler default-operator-then-fallback approach.
**Self-heal — deliberately NOT done.** Auto-rewriting the operator on *existing* schedules was considered and rejected (architect): reassigning staffId without re-checking availability can double-book, and it would clobber deliberate manual operator overrides. The fix only governs *newly* auto-booked items; pre-existing wrong-operator rows must be corrected manually (edit the schedule) — they don't self-heal.

## Schedule machineId drifts when a line item is reassigned
The Machine Schedule board groups jobs by `job_schedules.machineId` (the schedule row), NOT the line item's current `machineId`. A schedule row freezes whatever machine the line item had when it was booked.
**Symptom:** reassign a line item's machine in the Production Queue → board still shows the job under the OLD machine; new machine card says "no jobs".
**Fix (in PATCH /api/job-line-items/:id):** the resync must fire on machine *change/removal*, not just first assignment. On change: delete the line item's existing schedule rows, then re-`autoScheduleLineItem` (skip rebooking if machine removed / item completed). The old check was `!previousMachineId` (newly-assigned only) which never resynced reassignments.

## Staff Schedule view (pivot of machine view)
`GET /api/scheduling/staff-sheet` is the machine-sheet flipped: groups the same schedules by `staffId`, each staff lists jobs across all machines with per-job `machineName`, plus `machinesByDate` (inverse of operatorsByDate). Only includes staff with a scheduled job or allocation in the window. `MachineScheduleBoard.tsx` normalizes both responses into a generic `BoardColumn` model and toggles between them — keep both endpoints' window/date-key logic identical or the two views diverge.
