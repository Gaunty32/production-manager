---
name: Holiday auto-approval & rollover
description: Rules for self-service holiday requests — auto-approval conditions, notification recipients, and Jan-Dec entitlement with 31 March rollover cut-off.
---

**Rules:**
- POST /api/staff-holidays/request auto-approves only holidayType "holiday" when BOTH: ≥7 calendar days notice (Europe/London day diff, not 168 hours) AND no more than 1 OTHER staff member has an approved holiday on any day of the range. Otherwise it stays pending.
- The overlap check + insert run inside a db.transaction holding `pg_advisory_xact_lock(hashtext('holiday-auto-approve'))` — keep any new auto-approval writes inside that lock or concurrent requests can over-approve.
- Notification emails (auto-approved AND pending) go to: approver staff (canApproveHolidays) + all manager/super_admin users, minus the requester. Fire-and-forget; failures only logged.
- Rollover: entitlement is Jan–Dec; unused previous-year days carry over but are only usable until 31 March, then lost. `buildAllowanceSummary` grants carry-over ONLY when the staff member has previous-year holiday rows — a blank prior year (new staff / pre-system) must NOT carry the full allowance forward.
- Drizzle insert into staff_holidays needs real Date objects for startDate/endDate — zod-parsed strings throw `value.toISOString is not a function`.

**Why:** Business rule from owner (Aug 2026): Anna/Chris only want to review requests that break cover or notice rules; rollover deadline is end of March.
