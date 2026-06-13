- [Production lead-time metrics](production-lead-times.md) — how booking-to-dispatch & production-window are measured, the logo-approval-date data gap, and UK timezone date rules.

- [File uploads (32MB ceiling)](customer-portal-uploads.md) — Autoscale=Cloud Run caps server-proxied uploads at ~32MB (no log = died at infra); always upload browser→GCS via presigned PUT (/objects/upload routes).
- [Drive Verification reconciliation](drive-verification-reconciliation.md) — invoice↔Drive-sheet matching is token-subset, not exact; keep it lenient (auto-push only covers new jobs, hand-typed rows vary).
- [DB transactions & row locks](db-transactions-row-locks.md) — db is websocket Pool (not Neon HTTP); db.transaction + .for("update") work — use them for claim/merge concurrency.
- [Chat null-message crash](chat-null-message-crash.md) — image/file-only chat msgs have null `message`; always `(msg.message||"")` before string ops or the whole inbox white-screens.
- [Direct conversation archiving](direct-conversation-archive.md) — direct channels share ONE status field; customer archive/delete hides them from staff, and staff inbox shows only status==open with no archived view ("disappearing channels").

- [Deadline Alerts vs Production Queue](deadline-alerts-stale-jobs.md) — stale incomplete jobs show in alerts but are filtered out of the queue; delete via super-admin trash → /api/admin/jobs/:id.

- [Deleting jobs (FK behavior)](deleting-jobs-fk.md) — job_messages & samples are onDelete:set-null (orphan, not delete); line items/schedules/files/errors/production cascade. Delete chat rows explicitly when purging jobs.

- [Auto-scheduling behavior](auto-scheduling-behavior.md) — booking needs a job_schedule row; two eligibility paths can drift; bulk endpoint has single-flight lock; opening Machine Schedule auto-books slots (side-effect).

- [Line item operator](line-item-operator.md) — operatorId falls back to machine.defaultOperatorId; keep create+update routes in parity; queue filters apply per-line-item (one row per line item).

- [Machine-sheet day keys & operators](machine-sheet-date-keys.md) — server owns the yyyy-MM-dd dateKey (never recompute client-side: UTC vs local diverges); per-day operator = Staff Allocations, defaultOperatorId only a fallback.

- [Print machine convention](print-machine-convention.md) — Print jobs force-routed to machine id 6 (operator Mollie); won't appear on the timeline until the operator has staff shifts (scheduler gates slots on shifts).

- [Casual shift offers](casual-shift-offers.md) — offeredToId reservation must be re-checked inside claimShiftAtomic's lock (TOCTOU), and every claimed→available transition must null offeredToId.
