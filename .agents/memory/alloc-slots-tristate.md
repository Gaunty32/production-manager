---
name: getStaffMachineAllocationSlots tri-state
description: The null vs [] vs non-empty return contract of getStaffMachineAllocationSlots, and why operator/coverage logic must handle all three.
---

# getStaffMachineAllocationSlots tri-state return

`getStaffMachineAllocationSlots(date, machineId, staffId, allocations)` in `shared/scheduling.ts` returns three distinct things, and they mean different things:

- `null` — the staff member has **no allocations at all** that day → they can work **any** machine during their shift.
- `[]` (empty array) — the staff member **is** allocated, but to **other** machines → **no** coverage for this machine.
- non-empty array — explicit allocation slots for this machine.

**Why:** Easy to collapse `null` and `[]` into one falsy check (`if (slots && slots.some(...))`). Doing so silently drops the "no allocations = any machine" case, so on-shift staff are not recognised as operators and machines get falsely flagged "no operator". A TV-dashboard operator/alert bug came from exactly this.

**How to apply:** Always branch explicitly: `if (slots === null) { use full shift availability }` else use the array. Cross-check the slot against the staff member's actual shift (`getStaffAvailableSlots`) before treating them as "covering now" — an allocation alone doesn't mean they're on shift. The capacity-minutes loop in `server/dashboardTv.ts` is the correct reference pattern.
