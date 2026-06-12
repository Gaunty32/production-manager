---
name: Print machine convention
description: Why Print jobs route to machine id 6 / Mollie, and why they may not show on the timeline.
---

# Print job routing

Any line item with `jobType` "print" (case-insensitive) is force-assigned to the dedicated
machine id **6 ("Print")**, whose `defaultOperatorId` is **Mollie**. Operator is forced from the
machine's default operator (single source of truth — do NOT hardcode Mollie's UUID in app code).

**Why:** Print is not embroidery (no stitch-count timing); SBS wanted all print work grouped under
one machine/operator in the Machine Schedule.

**How to apply:**
- Enforced server-side in the line-item POST and PATCH routes (force machineId, then force operator
  for print, overriding any incoming operatorId). Keep both routes in parity.
- `storage.ensurePrintMachine()` (called at boot after `seedMachines`) idempotently creates/normalizes
  machine 6 and resolves Mollie by name. `index.ts` also backfills non-compliant print items.

**Gotcha — empty timeline:** Print jobs get a `job_schedule` row only via the per-item
`autoScheduleLineItem` (the bulk `/api/scheduling/auto-schedule` endpoint is embroidery-only).
Auto-scheduling needs the operator to have **staff shifts** (engine intersects machine slots with
shift slots; no shift = no slot = no schedule). Mollie has no shifts in the demo DB, so print items
are assigned but invisible on the Machine Schedule timeline until shifts/allocations exist. The Print
*machine* still shows as a column (active machines are listed regardless of scheduled jobs).
