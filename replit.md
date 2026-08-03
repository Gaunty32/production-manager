# Overview

**Production Planner** — production management system for Select Branding Solutions (manufacturing/embroidery), with staff and customer portals. Tracks customer orders, schedules machines, manages dispatch deadlines, and covers the full lifecycle from order submission to invoicing and customer communication.

# User Preferences

- Preferred communication style: simple, everyday language (non-technical user). Remind them to Republish after each feature.
- Wording: never use the phrase "to make" in the app — use "outstanding" instead (e.g. "Garments outstanding", "150 outstanding").
- Do NOT propose follow-up/next tasks — the user finds them distracting (requested 29 Jul 2026).
- Push the code to GitHub (Gaunty32/production-manager, origin remote) at the end of each working session (requested 3 Aug 2026).

# Tech Stack

- **Frontend**: React, TypeScript, Vite, shadcn/ui, Tailwind, TanStack React Query, React Hook Form + Zod, wouter
- **Backend**: Express.js, Node.js, TypeScript, RESTful API
- **Database**: Neon Serverless PostgreSQL via Drizzle ORM
- **Auth**: email/password with bcrypt + Express sessions (rolling 7-day sessions)
- **Storage/Uploads**: Replit Object Storage (GCS) + Uppy
- **External APIs**: Xero (invoicing), Resend (email), DPD Web Connect (shipping), Stripe (saved cards + auto-charging)

# Core Features

## Jobs & Scheduling
- Multi-line-item jobs: machine assignment, quantity, stitch count, logo approval, position. Job types: Embroidery, Print, Bagging, Other.
- Intelligent scheduling: calculates production time from stitch count; finds conflict-free slots using machine blocks, staff shifts, staff-machine allocations, holidays, existing schedules. Auto-scheduling on machine assignment prioritises overdue/undated jobs.
- Schedule page tabs: **Deadline Alerts** (`GET /api/scheduling/health`, risk categories Will Miss / Urgent / At Risk / On Track / Unscheduled) and **Accuracy** (`GET /api/scheduling/accuracy`, estimated vs actual production time).
- Machine suggestions (`MachineSuggestions.tsx`, `GET /api/scheduling/machine-suggestions`): ranked machine cards in job create/edit dialogs; click to assign.
- Machine management page: name, heads, stitches/minute, changeover time, active status.
- Production time estimate formula: runs = ceil(qty/heads); ceil((runs*((stitch/spm)+changeover)*multiplier)/10)*10.

## Production Tracking
- Line-item completion records user, timestamp, actual production time. Partial production supported via `production_entries` (source of truth for per-staff credit; `completedById` fallback only when an item has zero entries).
- Time entry uses start/finish clock times (overnight supported; suspicious times need a "Save anyway" confirm).
- BulkCompleteDialog "Team" split validates against remaining quantity; per-item "Part complete" checkbox saves progress without completing.
- Production queue: one row per line item, traffic-light indicators for logo approval and goods received; collapsible Completed Orders section.
- Gamification: star system + leaderboard. Big Screen "Production Display" for the floor.

## TV Dashboard (`/dashboard-tv`)
- For the Firestick TV. Token-protected (`tv-dashboard-token`), auto-refreshes every 60s, fullscreen toggle.
- Rotation (60s per page; final page holds 180s): **Today's Plan** → **Order System Production** (embedded iframe of the other app's tokened TV display; URL lives in the `ORDER_SYSTEM_TV_URL` env var, served to the client via the TV data endpoint — never hardcode it in client code; page only appears when the env var is set) → **Due Out — Next 48 Hours** → **Team Goal** → **Our Team** (only if operatives exist) → **Up Next** (always last).
- Today's Plan: per-person checklists of today's scheduled items + per-machine line-up (section 13 `todaysPlan` in `server/dashboardTv.ts`).
- Due Out: overdue/due today/next 48h tiles + colour-coded job rows with allocated person (`dueOut`, max 12 rows).
- Team Goal: garments/jobs left, this week vs last week, contributor bars (`teamGoal`).
- Our Team: ALL operatives on one adaptive-grid page (2 cols ≤4, 3 cols 5–6, 4 cols 7+) with plain-language target badges (▲ Above ≥110%, ● On 90–109%, ▼ Below <90%) from last complete week (`operatives`).
- Up Next: next jobs table sorted by due date, overdue/today rows flash red, tomorrow green, max 11 rows (`upNext`, section 14).
- Person attribution on TV pages: line-item operatorId falling back to machine defaultOperatorId. Ops board page was removed July 2026.

## Staff & Users
- Roles incl. `super_admin`, `admin`, manager, `demo`. Reports restricted via `canViewReports()` (super_admin, admin, demo) — enforced by `/api/reports` prefix middleware, sidebar, and page guard. Invoicing gated by `canViewPrices`.
- Staff disable (leavers): `active` flag on staff; disabled staff keep history but are hidden from pickers and excluded from scheduling. Deleting staff erases history (confirmation warns).
- Staff email notification toggle (`emailNotificationsMessages` on `users`, default true) for customer message alerts.

## Customer Portal
- Read-only order status with search/sort/filter, DHL tracking; mobile-optimised card layouts.
- Job submission form with Logo Type selector (Repeat/New); "New Logo" emails chris@selectuniforms.co.uk + james@selectuniforms.co.uk (`sendNewLogoSetupEmail`).
- Multi-user logins per customer, customer team management, password generation/reset, staff impersonation.
- Invoice history with line-item breakdowns; "View Pricing" button; express-service surcharge warning.
- Saved Payment Cards (`/customer/payment-methods`): Stripe SetupIntents + Elements; `stripeCustomerId` on customers. Auto-charging: when invoicing, if customer has `creditAccount === false` and a saved card, full total charged via `chargeCustomerCard()` (`server/stripeService.ts`); Xero invoice created regardless.

## Messaging
- Unified inbox: customers at `/customer/messages`, staff at `/messages` (tiled customer grid with avatars/unread badges). Auto-refresh; direct (non-job) conversations supported.
- Sample images in chat with pinned strip and customer approval ("Approved, please proceed." auto-sends). Sample approvals workflow: `pending_approval` / `amends_required` / `approved`.
- "Team only" internal messages in job chats hidden from customers.
- Email notifications both directions (staff ↔ customer) respecting per-user toggles; customer toggle via Bell icon (default false). Browser push notifications + banner in CustomerInbox.
- CustomerInbox header has Home + Submit New Job buttons (notification emails deep-link here).

## Invoicing
- Completed jobs move to a draft queue grouped by customer for batch invoicing via Xero API (account codes, tax types, invoice dates). Logo-only invoices supported. Customer pricing tables for quotes.
- Order acknowledgement emails on job approval with payment instructions + PDF attachment.

## Reports (Weekly Reports page)
- Tabs: weekly performance (with date filtering), **Key Metrics** (8 cards, week nav, rolling 16-week trends; `GET /api/reports/key-metrics`; delivery dialog on On-Time/Late cards; prices zeroed for roles without pricing access), **Staff Productivity** (actual vs expected per staff + date range, print button; `GET /api/reports/staff-productivity`), **Data Quality** (`GET /api/reports/data-quality`, flags missing/suspicious actual times), Contract Embroidery Trend Chart.
- Key Metrics definitions: job completed = week of latest line-item completion (London time); order placed = `COALESCE(submitted_at, goods_received)`; on-time vs `required_dispatch_date` per job.
- Weekly performance reports emailed automatically.

## Demo Mode
- `demo` role user (Users page → "Setup Demo Account"; credentials `demo@selectbranding.co.uk` / `SBdemo2025!`): amber banner, masked customer names (`DemoText`), masked prices (`DemoAmount`). Implementation: `client/src/lib/demoMode.tsx`.
- `/demo-access`: public lead-capture page; `POST /api/demo/request-access` provisions demo account and emails credentials (CC chris@selectbranding.co.uk + james@selectuniforms.co.uk).

## Shipping
- DPD integration: staff book DPD UK shipments, generating tracking numbers and labels.

# Gotchas

- App shell `<main>` is `overflow-hidden` — every page must provide its own scroll container (`h-full overflow-y-auto`).
- The default query fetcher does NOT serialize object queryKey segments — use an explicit queryFn for query-param endpoints.
- Query cache default `staleTime` is Infinity — use `staleTime: 0` where freshness matters.
- Dev and production use separate databases; republishing pushes code/schema only, never data.
