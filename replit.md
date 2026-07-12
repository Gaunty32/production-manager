# Overview

**Production Planner** — a comprehensive production management system for manufacturing by Select Branding Solutions, featuring both staff and customer portals. It is designed to streamline operations, improve efficiency, and enhance customer satisfaction by tracking customer orders, scheduling machines, and managing dispatch deadlines. The system provides operational transparency and includes capabilities for multi-line item job tracking, robust scheduling integrated with machine and staff availability, and detailed production metrics. Its ambition is to offer a complete solution for the entire production lifecycle, from order submission to invoicing and customer communication, aiming for significant market potential in the manufacturing sector.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions

The application uses Material Design principles with a minimalist aesthetic, offering light/dark modes. Jobs are color-coded, with overdue and "due today" jobs highlighted. The dashboard features KPIs and an interactive scheduling timeline with conflict detection. Tooltips provide job notes and line item breakdowns. The UI is mobile-responsive. The dashboard uses a card-based "scorecard" for KPIs that double as clickable filters. The "Production Queue" displays all non-completed jobs, one row per line item, grouped by job with customer color coding and urgency indicators. A collapsible "Completed Orders" section shows invoiced jobs. A "Production Display" (Big Screen View) is optimized for manufacturing floors, showing a 3-day production queue and a 30-day rolling leaderboard with a stitches per hour line graph, auto-refreshing. Customer portal views are also mobile-optimized with card-based layouts.

## Technical Implementations

The frontend uses React, TypeScript, Vite, `shadcn/ui`, and Tailwind CSS, leveraging TanStack React Query for server state and React Hook Form with Zod for validation. The backend is built with Express.js, Node.js, and TypeScript, following a RESTful API design. Authentication is email/password-based with bcrypt and session management. Data is stored in a PostgreSQL database via Drizzle ORM, with Zod schemas for validation.

The system supports multi-line item jobs with independent attributes like machine assignment, quantity, stitch count, logo approval, and position. An intelligent scheduling system calculates production time and identifies conflict-free time slots by considering machine blocks, staff shifts, staff-machine allocations, holidays, and existing schedules. The scheduling dialog offers intelligent slot selection and manual entry. The Schedule page now has two additional tabs: **Deadline Alerts** (`GET /api/scheduling/health`) which categorises every active embroidery line item by risk status (Will Miss / Urgent / At Risk / On Track / Unscheduled) with clickable summary tiles to filter, and **Accuracy** (`GET /api/scheduling/accuracy`) which compares estimated production time (from the stitch-count formula) against actual times recorded at completion, shown per-machine and as a recent-jobs table. The Unscheduled Jobs panel now sorts by urgency and colour-codes overdue/urgent jobs. A complete invoicing workflow moves completed jobs to a draft queue, grouping them by customer for batch invoicing with Xero API integration. Customer pricing tables support accurate quote generation. A logo setup queue tracks customer logo approvals.

A gamification system tracks staff performance with a star system and leaderboard. User management allows `super_admin` roles to manage staff accounts. Line item completion tracking records user, timestamp, and actual production time. The production queue uses traffic light indicators for logo approval and goods received status. Job types include Embroidery, Print, Bagging, and Other. The customer portal provides a read-only interface for customers to view order status, filterable, with search, sorting, and DHL tracking.

A customer job upload system allows customers to submit new job requests for staff review. Real-time chat and email notifications facilitate communication. Staff can impersonate customers. Secure password generation and reset functionality are implemented for customer portal access. The system generates weekly performance reports. A public demo portal showcases customer portal features.

A unified messaging system provides an inbox experience for both staff and customers. Customers access `/customer/messages` for all job conversations; staff access `/messages` for all customer conversations. Messages auto-refresh. The system supports direct (non-job-tied) conversations between staff and customers. Staff can attach sample images to chat messages, which are displayed inline and in a pinned strip, with customer approval options. Staff can send "Team only" internal messages in job chats, which are hidden from customers. The Staff Messages page (`/messages`) has been redesigned with a tiled customer grid, showing avatars, job counts, and unread badges. Staff and customer profile picture uploads are supported.

Additional features include:
- Weekly performance report date filtering.
- Automatic scheduling upon machine assignment, prioritizing overdue and undated jobs.
- Logo-only invoice support for approved logo setups.
- Partial production tracking for line items.
- Multi-user customer portal support with individual logins.
- Customer portal enhancements including a "View Pricing" button.
- Express service warning with surcharge for specific job criteria.
- Enhanced invoice dates and Xero integration details, including account codes and tax types.
- Enhanced production worksheet printing with intelligent page-break controls.
- Improved auto-scheduling with case-insensitive job types, overdue job prioritization, and default work hours.
- Contract Embroidery Trend Chart in weekly reports showing production output and invoice value.
- Sample approvals workflow for staff to send samples to customers for review, with `pending_approval`, `amends_required`, and `approved` statuses.
- Machine management interface for staff to configure embroidery machine details (name, heads, stitches/minute, changeover time, active status), with real-time indicators and scheduling integration.
- Customer team management allowing customers to add/manage their portal users.
- Customer invoice history providing a view of past invoices with line item breakdowns.
- Order acknowledgement emails sent to customers upon job approval, including payment instructions and a PDF attachment of order details.
- DPD Shipping Integration for staff to book DPD UK shipments directly, generating tracking numbers and labels.

# External Dependencies

-   **Database Service**: Neon Serverless PostgreSQL
-   **ORM**: Drizzle ORM
-   **Object Storage**: Replit Object Storage (Google Cloud Storage backend)
-   **File Upload**: Uppy (@uppy/core, @uppy/aws-s3, @uppy/dashboard, @uppy/react)
-   **UI Component Libraries**: `shadcn/ui`, Radix UI primitives, Embla Carousel, Lucide React
-   **Date Utilities**: `date-fns`
-   **Form Management & Validation**: React Hook Form, Zod, @hookform/resolvers
-   **Styling**: Tailwind CSS, `class-variance-authority`, `clsx`, `tailwind-merge`
-   **Build Tools**: Vite, esbuild
-   **Authentication**: bcrypt, Express sessions
-   **State Management**: TanStack React Query
-   **Routing**: Wouter
-   **External APIs**: Xero API, Resend (for email notifications), DPD Web Connect REST API

# Recent Enhancements

- **Customer sample approval**: "Approved, please proceed." button in CustomerInbox now auto-sends the message immediately instead of just pre-filling the input.
- **Customer new-message notifications**: CustomerInbox requests OS browser notification permission on mount, fires a browser push notification, and shows a prominent dismissible primary-color banner in the chat panel when a new staff message arrives.
- **Staff email notification toggle**: `emailNotificationsMessages` boolean column added to `users` table (default true). Managed via the staff profile dialog in the Messages page. When a customer sends a job message, all staff with the toggle enabled receive an email notification via Resend. Route: `PATCH /api/staff/me/notification-settings`.
- **Demo mode**: A `demo` role user can be created by super_admins via the "Setup Demo Account" button on the Users page (calls `POST /api/admin/ensure-demo-user`, credentials: `demo@selectbranding.co.uk` / `SBdemo2025!`). When logged in as a demo user, a persistent amber banner shows at the top of the app, customer names display with alternating greyed characters (`DemoText` component), and financial figures show as `£**.00` (`DemoAmount` component). Applied across Dashboard, InvoicingQueue, Customers, WeeklyReports, and StaffMessages pages. Implementation: `client/src/lib/demoMode.tsx` (context + utilities), `client/src/components/DemoText.tsx` (components).
- **Demo access gate** (`/demo-access`): Public lead-capture landing page for prospective clients wanting to try the demo. Visitors enter name, work email, and optional company name. On submit, `POST /api/demo/request-access` auto-provisions the demo account if needed, then sends a branded email to the visitor with login credentials (To: visitor, CC: chris@selectbranding.co.uk + james@selectuniforms.co.uk). Email function: `sendDemoAccessEmail` in `server/emailService.ts`.
- **Rolling sessions**: Session middleware now uses `rolling: true` so the 7-day session timer resets on every request. Customers stay logged in as long as they're active.
- **Logo type on job submission**: Customer job submission form (`CustomerSubmitJob.tsx`) now includes a "Logo Type" selector — **Repeat Logo** (logo already set up) or **New Logo** (new setup required). Stored as `logoType` field in `customerJobSubmissionSchema`. When "New Logo" is selected, the server automatically sends a notification email to chris@selectuniforms.co.uk and james@selectuniforms.co.uk with the customer name and job name. Email function: `sendNewLogoSetupEmail` in `server/emailService.ts`.
- **Customer email notification preference**: `emailNotificationsMessages` boolean column added to `customer_users` table (default `false`). Customers control this via a Bell icon in the Messages page header (`/customer/messages`) — clicking it opens a popover with a toggle "Email me when a new message arrives". The backend filters this before sending `sendNewChatEmail` for both job chat and direct conversation notifications. Route: `PATCH /api/customer-auth/me/notification-settings`.
- **Direct message email notifications (bidirectional)**: Fixed critical gap where staff were not notified when customers sent direct messages, and customers were not notified when staff replied. New `sendCustomerDirectMessageNotificationEmail` function in `emailService.ts` notifies all staff with notifications enabled when a customer creates or replies in a direct conversation. Staff replies in direct conversations now also trigger `sendNewChatEmail` to customer users with notifications enabled. All customer direct conversation routes updated with impersonation-aware session lookup (`impersonationCustomerUserId || customerUserId`) and improved error logging for access denied cases.
- **Machine suggestion panel** (`MachineSuggestions.tsx`): When creating or editing a job, entering quantity + stitch count for an embroidery line item auto-fetches `GET /api/scheduling/machine-suggestions` (700ms debounce) and shows ranked machine cards below the machine dropdown. Each card displays: machine name, "Meets/Misses deadline" status, estimated production time, earliest available date, and a "Best" badge on the top-ranked option. Clicking a card instantly assigns that machine. Shown in both `JobFormDialog` and `JobEditDialog`.
- **Staff disable (leavers)**: `active` boolean on `staff` table (default true). Staff page has Disable/Re-enable per row (super_admin only, enforced in `PATCH /api/staff/:id`). Disabled staff keep all history (production entries, leaderboard, reports) but are hidden from all assignment dropdowns client-side and excluded from auto-scheduling/machine-suggestion candidates server-side. Edit dialogs still show a currently-assigned disabled person labelled "(disabled)". Deleting staff permanently erases their production history — the delete confirmation now warns about this and points to Disable.
- **Machine Settings scroll fix**: page content wrapped in `h-full overflow-y-auto` (app shell's `<main>` is `overflow-hidden`, so every page provides its own scroll container).
- **Saved Payment Cards + Auto-charging**: Customers can save card details within their portal at `/customer/payment-methods`. Uses Stripe SetupIntents + Stripe Elements (embedded card form). Backend creates/retrieves a Stripe Customer record per company (stored as `stripeCustomerId` on the `customers` table), creates SetupIntents, and lists/deletes saved payment methods. Routes: `POST /api/customer-portal/stripe/setup-intent`, `GET /api/customer-portal/stripe/cards`, `DELETE /api/customer-portal/stripe/cards/:id`. Frontend uses `@stripe/react-stripe-js` and `@stripe/stripe-js`. Nav link "Payment Cards" added to both desktop and mobile menus on the customer dashboard. Stripe keys: `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` secrets. **Auto-charging**: When an invoice is raised (both single-job `POST /api/xero/invoice/:jobId` and consolidated `POST /api/xero/consolidated-invoice`), if the customer has `creditAccount === false` AND a `stripeCustomerId`, the full invoice total is automatically charged to their most recently saved card using `chargeCustomerCard()` in `server/stripeService.ts`. The Xero invoice is always created regardless of payment outcome. Staff see a toast notification confirming the charge or warning if it failed. The `stripeCharge` result is returned in both invoice responses.