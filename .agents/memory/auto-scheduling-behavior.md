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
