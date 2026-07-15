- [Production lead-time metrics](production-lead-times.md) — how booking-to-dispatch & production-window are measured, the logo-approval-date data gap, and UK timezone date rules.

- [File uploads (32MB ceiling)](customer-portal-uploads.md) — Autoscale=Cloud Run caps server-proxied uploads at ~32MB (no log = died at infra); always upload browser→GCS via presigned PUT (/objects/upload routes).
- [Drive Verification reconciliation](drive-verification-reconciliation.md) — invoice↔Drive-sheet matching is token-subset, not exact; keep it lenient (auto-push only covers new jobs, hand-typed rows vary).
- [DB transactions & row locks](db-transactions-row-locks.md) — db is websocket Pool (not Neon HTTP); db.transaction + .for("update") work — use them for claim/merge concurrency.
- [Chat null-message crash](chat-null-message-crash.md) — image/file-only chat msgs have null `message`; always `(msg.message||"")` before string ops or the whole inbox white-screens.

- [Mobile white-screen crashes](mobile-white-screen-crashes.md) — iPhone-only blank pages: date-fns format() throws on Safari-Invalid-Date + matchMedia.addEventListener unsupported; ErrorBoundary now wraps Router.

- [Client auto-refresh on republish](client-auto-refresh.md) — open clients poll /api/version & reload on new build; version MUST be deterministic (hash built index.html, not Date.now) or Cloud Run instances cause reload loops.
- [Direct conversation archiving](direct-conversation-archive.md) — direct channels share ONE status field; customer archive/delete hides them from staff, and staff inbox shows only status==open with no archived view ("disappearing channels").

- [Deadline Alerts vs Production Queue](deadline-alerts-stale-jobs.md) — stale incomplete jobs show in alerts but are filtered out of the queue; delete via super-admin trash → /api/admin/jobs/:id.

- [Deleting jobs (FK behavior)](deleting-jobs-fk.md) — job_messages & samples are onDelete:set-null (orphan, not delete); line items/schedules/files/errors/production cascade. Delete chat rows explicitly when purging jobs.

- [Auto-scheduling behavior](auto-scheduling-behavior.md) — booking needs a job_schedule row; two eligibility paths can drift; bulk endpoint has single-flight lock; opening Machine Schedule auto-books slots (side-effect).

- [Line item operator](line-item-operator.md) — operatorId falls back to machine.defaultOperatorId; keep create+update routes in parity; queue filters apply per-line-item (one row per line item).

- [Staff credit attribution](staff-credit-attribution.md) — production_entries is the source of truth for per-staff credit; completedById fallback ONLY when an item has zero entries all-time, or you double count.

- [Staff active flag](staff-active-flag.md) — leavers get active=false (never delete: wipes history); every NEW staff picker & scheduling candidate list must filter it, historical views must NOT.

- [Machine-sheet day keys & operators](machine-sheet-date-keys.md) — server owns the yyyy-MM-dd dateKey (never recompute client-side: UTC vs local diverges); per-day operator = Staff Allocations, defaultOperatorId only a fallback.

- [Print machine convention](print-machine-convention.md) — Print jobs force-routed to machine id 6 (operator Mollie); won't appear on the timeline until the operator has staff shifts (scheduler gates slots on shifts).

- [Machine ID validation cap](machine-id-validation-cap.md) — "Number must be ≤ 5" on save = machineId zod fields were hardcoded .max(5); machines table grows (id 6 = Print). Never cap an FK id to a fixed number.

- [Dev vs prod data divergence](dev-prod-data-divergence.md) — republish pushes code/schema only, never row data; dev-DB cleanups never reach the live app. Fix live data through the published app's own UI/API, not from agent tools (prod is read-only).

- [Alloc-slots tri-state](alloc-slots-tristate.md) — getStaffMachineAllocationSlots returns null(=any machine)/[](=elsewhere)/slots; never collapse null & [] into one falsy check or operators get dropped.

- [Holiday approval workflow](holiday-approval-workflow.md) — any route writing staffHolidays.status must be approver-gated (legacy CRUD too, or staff self-approve); /me returns canApprove even with no staff row; half-day & calendar-year clamp rules.

- [wouter query-only navigation](wouter-query-navigation.md) — query-only URL changes don't remount route components; derive query-driven state via useSearch()+effect, not a one-time useState read.

- [Casual shift offers](casual-shift-offers.md) — offeredToId reservation must be re-checked inside claimShiftAtomic's lock (TOCTOU), and every claimed→available transition must null offeredToId.

- [DPD Local API](dpd-local-api.md) — use api.dpdlocal.co.uk (old public-ws is dead); labels are HTML, print via sandboxed no-scripts iframe; fail hard on missing consignment number.

- [Default query fetcher](query-default-fetcher.md) — queryKey.join("/") turns object segments into "[object Object]"; params need an explicit queryFn.

- [Auth session patterns](auth-session-patterns.md) — staff=userId (regenerates), customer=customerUserId (legacy login does NOT regenerate); any new login path MUST regenerate before attaching id. OTP lives in login_codes table.
- [Server hot-reload gap](server-hot-reload-gap.md) — backend edits may not auto-reload in dev; restart the workflow before curl-testing new server behavior or you test stale code.
- [External tokened embeds](external-tokened-embeds.md) — cross-app TV embeds: tokened URL goes in an env var served via the token-gated data endpoint, never hardcoded in client code.
- [Firestick keep-awake](firestick-keep-awake.md) — hidden 1px videos are ignored by Silk; screensaver defence needs a visible (background-coloured) video + wake-lock retry loop.
