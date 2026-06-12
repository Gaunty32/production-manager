---
name: Machine-sheet day bucketing & operator-per-day
description: Why /api/scheduling/machine-sheet must own the yyyy-MM-dd dateKey, and how per-day operators resolve from Staff Allocations.
---

# Machine schedule board — day keys & per-day operator

## Rule: the server owns the day bucket
`GET /api/scheduling/machine-sheet` attaches a canonical `dateKey` (`yyyy-MM-dd`)
to every job row, and the board groups by that key. The same server `ymd()` helper
also keys `operatorsByDate`. The frontend must NOT recompute the bucket from the raw
timestamp (`format(new Date(job.date),'yyyy-MM-dd')`).

**Why:** server runs UTC, browser runs local (UK). Two independent local-time
conversions diverge around midnight/DST, so a client-recomputed key would miss
`operatorsByDate[date]` and silently fall back to the default operator. Letting the
server produce both the job bucket key and the operator key guarantees they always
match each other.

**How to apply:** when displaying a server-provided `yyyy-MM-dd` key, parse it with
`new Date(`${key}T00:00:00`)` (local) for labels — never `new Date(key)` (UTC, shifts
the day in negative-offset zones).

## Board shows every window day, not just days with jobs
The response also carries a top-level `dateKeys: string[]` (ordered window days).
The board iterates `dateKeys` (via `buildDays`), not `groupByDate(jobs)`, so an
allocated-but-idle machine (e.g. operator assigned, nothing scheduled) STILL shows
its per-day operator. A day row renders if it has jobs OR an operator; days with
neither are hidden (avoids "No operator / No jobs" noise). Card/print header shows
**Today's** operator (`operatorsForDay(machine, dateKeys[0])`), not the raw default.

**Why:** the prior board only rendered job day-groups, so machines with allocations
but no jobs showed "Default: None / Nothing scheduled" — the exact bug users hit.

## Per-day operator resolution (Staff Allocations as source of truth)
Operator for a machine on a day = whoever is in `staffMachineAllocations` for that
machine+day; `machine.defaultOperatorId` is ONLY a fallback when nobody is allocated.
Allocation matching convention (must match `shared/scheduling.ts`):
allocation applies if `machineId` matches AND
(`new Date(a.date).toDateString() === day.toDateString()` OR
`a.isRecurring && a.recurringDaysOfWeek?.includes(day.getDay())`), with
`getDay()` 0=Sun..6=Sat. Auto-scheduling already restricts candidates to allocated
staff then prefers the default operator — same precedence, kept in sync.
