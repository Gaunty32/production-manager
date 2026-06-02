- [Production lead-time metrics](production-lead-times.md) — how booking-to-dispatch & production-window are measured, the logo-approval-date data gap, and UK timezone date rules.

- [File uploads (32MB ceiling)](customer-portal-uploads.md) — Autoscale=Cloud Run caps server-proxied uploads at ~32MB (no log = died at infra); always upload browser→GCS via presigned PUT (/objects/upload routes).
