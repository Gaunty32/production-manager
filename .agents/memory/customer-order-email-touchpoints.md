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

Abode stocking orders are an explicit exception: send one despatch email per
order to Abode's active opted-in portal contacts, not to the stocking recipients.
For Abode, label creation is despatch even before production completion, and a
new manual despatch must email even if tracking is missing.

**Why:** The user required Abode to receive a despatch email for each order.

**How to apply:** Queue atomically at the new despatch event, preserve the
per-order idempotency key across retries, and never mark an email sent when no
eligible contact exists. Do not apply generic consolidated-shipment grouping or
production-completed wording to Abode. Historical catch-up requires a separate
explicit decision; adding historical tracking alone must not send another email.

The customer approved both the production-started and dispatch email designs,
including the consolidated multi-job dispatch format.

**Why:** Future changes should preserve the approved content, branding, and
overall layout unless a redesign is explicitly requested.

**How to apply:** Treat the current templates as the accepted baseline and make
only targeted content or reliability changes by default.

Operator photos use the Team member's own photo first, then the linked system
user's photo as a fallback.

**Why:** Regular team members may work on customer orders without having a
system login, while existing system-user photos should continue to work without
being uploaded twice.

**How to apply:** Any customer-facing operator identity should resolve the staff
record first and only fall back to the linked user profile when it has no photo.