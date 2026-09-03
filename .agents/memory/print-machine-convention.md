---
name: Print machine convention
description: Why Print jobs route to machine id 6 while their responsible operator remains selectable.
---

# Print job routing

Any line item with `jobType` "print" (case-insensitive) is force-assigned to dedicated
machine id **6 ("Print")**. The responsible operator is selected at job level and must be copied
to unfinished Print line items; Mollie is only the machine's fallback default for legacy/unallocated work.

**Why:** Print is not embroidery (no stitch-count timing), so it stays grouped on one machine.
However, several active operators may run Print work, so machine routing must not force job ownership.

**How to apply:**
- Enforce machine id 6 server-side, but derive the line-item operator from the job's selected
  responsible operator. Keep line-item POST/PATCH and job reallocation behavior in parity.
- `storage.ensurePrintMachine()` (called at boot after `seedMachines`) idempotently creates/normalizes
  machine 6 and supplies a fallback default. `index.ts` backfills Print machine/operator parity.

**Gotcha — empty timeline:** Print jobs get a `job_schedule` row only via the per-item
`autoScheduleLineItem` (the bulk `/api/scheduling/auto-schedule` endpoint is embroidery-only).
Auto-scheduling needs the selected responsible operator to have **staff shifts** (the engine
intersects machine slots with shift slots; no shift = no slot = no schedule). The Print machine still
shows as a column because active machines are listed regardless of scheduled jobs.
