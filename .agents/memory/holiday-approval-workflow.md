---
name: Holiday approval workflow
description: Security + math constraints for the staff holiday request→approval→allowance system.
---

# Holiday request / approval / allowance workflow

The staff holiday system has two entry paths sharing one `staffHolidays` table:
manager-entered holidays (default status `approved`) and self-service requests
(status `pending`). Scheduler `isStaffOnHoliday` only blocks on `approved` rows.

## Access-control rule (critical)
Any route that can write `status` on a staff holiday MUST be approver-gated
(super_admin OR `staff.canApproveHolidays`). This includes the *legacy*
`POST/PATCH/DELETE /api/staff-holidays[/:id]` routes — because their update schema
accepts `status`, leaving them on `isStaffAuthenticated`-only lets any staff member
self-approve their own request. Status changes for requests should flow through the
dedicated `/:id/approve` and `/:id/decline` endpoints.
**Why:** earlier build shipped these CRUD routes open; a non-approver could PATCH
their own pending holiday to `approved` and bypass the whole workflow.

Only super_admins may flip `canApproveHolidays` (enforced in `PATCH /api/staff/:id`,
not just the UI). `updateStaffSchema` must whitelist `holidayAllowance` +
`canApproveHolidays` or staff edits silently no-op.

## /me must not 403 for approvers without a staff record
Super_admins often have no linked `staff` row. `GET /api/staff-holidays/me` returns
`canApprove` and the UI derives approver tabs from it, so return
`{staff:null, canApprove, summary:null}` instead of 403 — otherwise approvers lose
the Requests/Allowances tabs.

## Allowance math
- `countHolidayDays` excludes weekends + bank holidays. Single-day leave with
  *either* half-day flag = 0.5 (don't require both flags).
- When clamping a holiday to the calendar year, drop a half-day flag if that
  boundary day fell outside the year (the clamped boundary is a different day).
- Allowance counts `holidayType === 'holiday'` only (not sick/other).
