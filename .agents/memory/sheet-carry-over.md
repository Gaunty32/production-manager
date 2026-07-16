---
name: Machine/staff sheet carry-over
description: How unfinished past-day bookings are carried onto today's machine & staff sheets
---

Machine-sheet and staff-sheet endpoints fetch job_schedule with a 30-day lookback and fold unfinished past bookings into TODAY (`carriedOver: true`, dateKey = today) via a shared `buildCarryOver` helper.

**Rules:** carried only if line item exists, not completed, has no booking today-or-later, and job status is pending/production; only the latest past booking per line item is kept (day, then startTime tie-break).

**Why:** past-booked unfinished work used to vanish from the sheets (Maggie bug, July 2026) because endpoints only fetched from today and auto-schedule skips items that already have a schedule row.

**How to apply:** on the staff sheet, carried work is attributed to whoever is allocated to the machine TODAY — never auto-include the original past staffId for carried rows. Cards/prints show estimated production time (fallback: slot duration), not clock times.
