---
name: Deadline Alerts vs Production Queue (stale jobs)
description: Why stale/incomplete jobs show in Deadline Alerts but cannot be deleted from the Production Queue, and the delete paths that exist.
---

Deadline Alerts (`GET /api/scheduling/health`, UI `ScheduleHealth.tsx`) lists EVERY active embroidery line item of a non-completed job, regardless of whether the job has full info (no machine / unscheduled / no logo approval all still appear).

The Production Queue (Dashboard.tsx) deliberately filters to "only show jobs that have all required info (dates + embroidery approval)". So an incomplete/stale job appears in Deadline Alerts but is INVISIBLE in the queue — and the queue is the only place with per-job/bulk delete buttons. Result: users see junk jobs in alerts with "nowhere to delete them".

Delete paths now:
- Data Cleanup card (Users page, super-admin) only deletes COMPLETED & INVOICED jobs (`deleteOldInvoicedJobs`) — cannot touch active/unscheduled jobs.
- Production Queue per-job + bulk delete → `DELETE /api/jobs/:id` (any staff) — only for jobs that pass the required-info filter.
- Deadline Alerts per-row trash (super-admin only) → `DELETE /api/admin/jobs/:id` (`requireSuperAdmin`) — added specifically so stale incomplete jobs can be removed where they're visible.

**Why** the separate `/api/admin/jobs/:id` route: the original `/api/jobs/:id` is `isStaffAuthenticated` only; gating the UI to super-admin without a server check is an authz gap (architect-flagged). Left the staff route intact for the Production Queue.
