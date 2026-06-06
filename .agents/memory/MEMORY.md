- [Production lead-time metrics](production-lead-times.md) — how booking-to-dispatch & production-window are measured, the logo-approval-date data gap, and UK timezone date rules.

- [File uploads (32MB ceiling)](customer-portal-uploads.md) — Autoscale=Cloud Run caps server-proxied uploads at ~32MB (no log = died at infra); always upload browser→GCS via presigned PUT (/objects/upload routes).
- [Drive Verification reconciliation](drive-verification-reconciliation.md) — invoice↔Drive-sheet matching is token-subset, not exact; keep it lenient (auto-push only covers new jobs, hand-typed rows vary).
- [DB transactions & row locks](db-transactions-row-locks.md) — db is websocket Pool (not Neon HTTP); db.transaction + .for("update") work — use them for claim/merge concurrency.
