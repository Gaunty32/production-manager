- [Production lead-time metrics](production-lead-times.md) — how booking-to-dispatch & production-window are measured, the logo-approval-date data gap, and UK timezone date rules.

- [File uploads (32MB ceiling)](customer-portal-uploads.md) — Autoscale=Cloud Run caps server-proxied uploads at ~32MB (no log = died at infra); always upload browser→GCS via presigned PUT (/objects/upload routes).
- [Drive Verification reconciliation](drive-verification-reconciliation.md) — invoice↔Drive-sheet matching is token-subset, not exact; keep it lenient (auto-push only covers new jobs, hand-typed rows vary).
- [DB transactions & row locks](db-transactions-row-locks.md) — db is websocket Pool (not Neon HTTP); db.transaction + .for("update") work — use them for claim/merge concurrency.
- [Chat null-message crash](chat-null-message-crash.md) — image/file-only chat msgs have null `message`; always `(msg.message||"")` before string ops or the whole inbox white-screens.
- [Direct conversation archiving](direct-conversation-archive.md) — direct channels share ONE status field; customer archive/delete hides them from staff, and staff inbox shows only status==open with no archived view ("disappearing channels").
