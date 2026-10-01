---
name: Overdue reminder policy
description: User-approved scheduling tradeoff and credit-policy boundary for overdue billing reminders.
---

Keep overdue reminders within the existing app's timer mechanism unless the user asks to change this approach. Delayed catch-up when Autoscale wakes is an accepted tradeoff, not a reason to propose migrating the project or changing hosting.

**Why:** The user rejected the complexity of a multi-service project migration and explicitly selected existing app timers after being told that Monday 08:00 UK delivery may be delayed while the app sleeps.

**How to apply:** Be clear about that limitation when discussing timing. Preserve UK local time across clock changes, catch up within the current week, and never imply that app timers guarantee exact-time execution on sleeping infrastructure.

The advance-payment statement is an email warning, not permission to automatically change customer credit terms.

**Why:** The request was to remind customers about overdue invoices while retaining the existing portal warning. It did not authorize automatic account restrictions.

**How to apply:** Keep payment-policy enforcement separate from reminder delivery. Do not change customer credit flags merely because a reminder was sent.