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

## Lifecycle exclusions must mirror the Production Queue
The `/api/scheduling/health` loop must exclude the same commercially/financially blocked jobs the Dashboard hides from the active queue, or invoiced & awaiting-payment jobs leak into the alert list. Job `status` ('pending'|'production'|'completed') is INDEPENDENT of `invoiceStatus` — an invoiced job often still has `status='pending'` and line items not marked `completed`, so checking only completion flags is not enough.
- Exclude when `invoiceStatus` is `'invoiced'` or `'ready'`, OR `invoicedAt` is set (status can drift out of sync with invoicedAt).
- Exclude when `customer.requiresAdvancePayment && !job.paymentReceived` (advance-payment customers; matches Dashboard awaitingPayment + autoScheduleLineItem gating).
**How to apply:** add these as early `continue` guards right after resolving `job`+`customer`, before risk classification. Verify rule changes against the PRODUCTION db (read-only) — dev db holds only demo/test data, the real Branding-Inc/invoiced records live in prod.
