---
name: Production lead-time metrics
description: How the Weekly Reports "Lead Times" measures work, the logo-approval-date data gap, and the UK-timezone rule for any day-bucketing of timestamp columns.
---

# Production lead-time measures

Two measures live on the staff Weekly Reports "Lead Times" tab (`getProductionTimeMetrics` in storage, `GET /api/reports/production-time`):
- **Booking → Dispatch**: working days from `jobs.submitted_at` to job completion (`MAX(jli.completed_at)`).
- **Production Window**: working days from queue-join (the LATER of `jobs.goods_received` and logo approval) to completion.

"Working days" excludes weekends AND rows in the `bank_holidays` table. Interval convention is `(start, end]` — same calendar day = 0 days.

## The logo-approval-date data gap
**The system only stored a `logo_approved` boolean per line item — there was no timestamp for WHEN it was approved.** A `job_line_items.logo_approved_at` column was added and is stamped when the boolean flips true (in `createJobLineItem` and `updateJobLineItem`).
**Why it matters:** the Production Window cannot be reconstructed for jobs completed before this column existed — they have no approval date. Such jobs are deliberately EXCLUDED from the Production Window average (their `productionDays` is null), not estimated. The measure builds up going forward. Booking→Dispatch is unaffected (uses `submitted_at`).
**Queue-join rule:** only measurable when goods are in AND `BOOL_AND(jli.logo_approved AND jli.logo_approved_at IS NOT NULL)` is true for the job (every line item approved with a recorded date). Don't use a bare `MAX(logo_approved_at)` — it ignores nulls and would understate the start when some line items aren't approved.

## UK timezone rule for day-bucketing (IMPORTANT, reusable)
Date columns (`submitted_at`, `goods_received`, `completed_at`, `logo_approved_at`, `bank_holidays.date`) are Postgres `timestamp` WITHOUT time zone holding UTC instants. **Do NOT extract the calendar day with JS `getUTCDate()` / `toISOString()`** — a late-night UK timestamp during BST lands on the wrong day, corrupting weekday/holiday classification (off-by-one working days).
**How to apply:** truncate to a UK calendar date IN SQL, e.g. `to_char((col AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date, 'YYYY-MM-DD')`, return as a 'YYYY-MM-DD' string, then in JS anchor with `new Date(str + 'T00:00:00Z')` and count days via UTC. Apply the same conversion to bank-holiday dates so the sets line up. This business operates in Europe/London.

## Related still-outstanding bug (separate)
Per-staff attribution SQL in `getWeeklyProductionByStaff` (and mirrored in `getDailyOutputByStaff`) credits the completer the FULL line-item quantity, so a finisher gets credit for work a colleague partially did. Approved fix (not yet applied): credit completer only `GREATEST(0, jli.quantity - SUM(production_entries))` and drop the `NOT EXISTS` exclusion so partial handoffs logged via RecordProductionDialog are counted.
