---
name: Casual shift offers & reservations
description: How shift offers (offeredToId) gate claims, and the two concurrency/lifecycle traps to keep in lockstep.
---

# Casual shift offers (offeredToId on shifts)

A published `available` shift can be *offered* to one casual person (`shifts.offeredToId`).
While offered, only that person sees/claims it; release clears `offeredToId` and re-opens to all.

## Two rules that must stay in lockstep

1. **Enforce the reservation inside the row-locked transaction, not just in the route.**
   The route-level pre-check (`offeredToId !== me`) is TOCTOU-only. `claimShiftAtomic`
   selects the shift `.for("update")` and MUST re-check `offeredToId` there before updating,
   or a concurrent offer/release can be bypassed.
   **Why:** access control on a value another request can mutate must be re-validated under the lock.

2. **Any transition claimed/offered → available must also null `offeredToId`.**
   Cancel (and any reclaim/reopen path) sets `status: "available"` — if it forgets
   `offeredToId: null`, the shift is silently still reserved to the old person while the
   code simultaneously notifies everyone it "opened up" → "why can't I see it?" incidents.
   **How to apply:** grep for `status: "available"` writes whenever touching shift lifecycle.

Fragments created when someone claims part of a window default to `offeredToId = null` (public) — correct.

## Never publish a shift offered to a non-loginnable person

Assign/invite flow: staff assign a `suggested` shift (`/offer` sets `offeredToId` quietly, no notify),
then `/api/shifts/invite` publishes the assigned suggested shifts (→ `available`) and WhatsApps each assignee.
Worker accepts (claim) or declines (`/api/casual/shifts/:id/decline` → `offeredToId=null, status=suggested`, back to pool).

**Rule:** only ever offer/publish a shift to a casual who is `active && pinHash` (can actually log in).
**Why:** an `available` shift with `offeredToId` set is hidden from *everyone except* that person
(available list filters out others' offers). If that person can't log in, the shift is orphaned —
invisible to all casuals until a manager manually `/release`s it.
**How to apply:** `/offer` rejects non-loginnable assignees (400); `/invite` filters to claim-capable
assignees *before* `publishShifts`, leaves the rest as `suggested`, and returns a `skipped` count.
