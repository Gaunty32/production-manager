---
name: Customer order email touchpoints
description: Reliability rules for production-started and completed/dispatch customer notifications.
---

Customer order emails must be queued by the same database write that creates the
eligible business state, then marked sent only after the provider accepts every
recipient.

**Why:** A pre-send sent marker can permanently lose an email after a process
crash, while a post-commit queue write leaves a smaller but equivalent loss
window. Broad eligibility scans can also email customers about historical jobs.

**How to apply:** Use queued-at and sent-at state, stable provider idempotency
keys per job/recipient/touchpoint, and retry only queued unsent records. Any new
completion, tracking, allocation, approval, or unblock path must create the
queue marker atomically when it makes the notification eligible.

Dispatch notifications group completed jobs by customer and DPD tracking number.
The provider idempotency key is shared by that customer/tracking/recipient group,
and every included job is marked sent together.

**Why:** Consolidated shipments must produce one customer email, not one email per
job sharing the same consignment.

**How to apply:** Any new dispatch trigger must call the shared grouping helper;
never send directly from a single-job DPD or completion route.