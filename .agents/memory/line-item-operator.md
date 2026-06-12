---
name: Line item operator assignment
description: Where operator (staff) gets defaulted/derived for job line items, and the create/update parity rule.
---

# Line item operator

`jobLineItems.operatorId` (varchar → staff.id) is the explicit operator. When absent, the effective operator falls back to the assigned machine's `defaultOperatorId`.

**Rule:** Any backend route that sets/changes a line item's `machineId` must default `operatorId` from `machine.defaultOperatorId` when no operator was supplied. Keep BOTH paths in parity:
- create: `POST /api/jobs/:jobId/line-items`
- update: `PATCH /api/job-line-items/:id`
**Why:** non-dialog flows (e.g. auto machine assignment) could otherwise leave machine-assigned items with no operator, making the Production Queue operator column and operator filter inconsistent.

**Display/filter fallback must match.** Frontend resolves operator the same way (explicit `operatorId`, else machine default) for both the displayed name and the filter. The Production Queue renders ONE ROW PER LINE ITEM, so machine/operator filtering must be applied at line-item level (filter each job's `lineItems`), not only job level — otherwise unrelated line items of a matched job still show.
