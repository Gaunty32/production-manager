# Overview

This application is a comprehensive production management system for manufacturing, featuring both staff and customer portals. It is designed to streamline operations, improve efficiency, and enhance customer satisfaction by tracking customer orders, scheduling machines, and managing dispatch deadlines. The system provides operational transparency and includes capabilities for multi-line item job tracking, robust scheduling integrated with machine and staff availability, and detailed production metrics. Its ambition is to offer a complete solution for the entire production lifecycle, from order submission to invoicing and customer communication, aiming for significant market potential in the manufacturing sector.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions

The application utilizes Material Design principles with a minimalist aesthetic, offering light/dark modes. Jobs are color-coded by customer, with overdue and "due today" jobs highlighted. The dashboard features KPIs and an interactive scheduling timeline with conflict detection. Tooltips provide job notes and line item breakdowns. The UI is mobile-responsive. The dashboard uses a card-based "scorecard" for KPIs that double as clickable filters. The "Production Queue" displays all non-completed jobs, one row per line item, grouped by job with customer color coding and urgency indicators. A collapsible "Completed Orders" section shows invoiced jobs. A "Production Display" (Big Screen View) is optimized for manufacturing floors, showing a 3-day production queue and a 30-day rolling leaderboard with a stitches per hour line graph, auto-refreshing every 2.5 minutes. Customer portal views are also mobile-optimized with card-based layouts.

## Technical Implementations

The frontend uses React, TypeScript, Vite, `shadcn/ui`, and Tailwind CSS, leveraging TanStack React Query for server state and React Hook Form with Zod for validation. The backend is built with Express.js, Node.js, and TypeScript, following a RESTful API design. Authentication is email/password-based with bcrypt and session management. Data is stored in a PostgreSQL database (Neon) via Drizzle ORM, with Zod schemas for validation.

The system supports multi-line item jobs with independent attributes like machine assignment, quantity, stitch count, logo approval, and position. A "quacking duck" validation alerts staff to quantity discrepancies. Jobs automatically transition to `invoiceStatus: 'ready'` when all line items are completed and revert to `pending` if any are marked incomplete, safeguarding invoices.

An intelligent scheduling system calculates production time based on line item quantity and stitch count. It identifies conflict-free time slots by considering machine blocks, staff shifts, staff-machine allocations, staff holidays, bank holidays, and existing schedules. The scheduling dialog offers both intelligent slot selection and manual entry. Staff-machine allocations restrict machine usage. A holiday management system automatically excludes these periods from scheduling. Customer pricing tables support accurate quote generation including flat-rate and tiered pricing.

A complete invoicing workflow moves completed jobs to a draft queue, grouping them by customer for batch invoicing with Xero API integration. Invoice dates default to the most recent Friday, and due dates are the 5th of the following month. Xero invoice line items are formatted professionally, with intelligent contact matching and conditional item code integration. The carriage charge system groups jobs by `consolidatedShipmentId` for combined charges and manages individual charges otherwise. A logo setup queue tracks customer logo approvals, adding a £10 charge upon approval.

A gamification system tracks staff performance with a star system and leaderboard, showing on-time/late completions and normalized stitches per head-hour. A "Daily Production" view provides per-staff breakdowns. User management, accessible by `super_admin` roles, allows creating, editing, and managing staff accounts, including activation/deactivation and password resets. Line item completion tracking records user, timestamp, and actual production time, automatically calculating total job production time.

The production queue uses traffic light indicators for logo approval and goods received status. Job types include Embroidery, Print, Bagging, and Other. The customer portal provides a read-only interface for customers to view order status, filterable by status, with search, sorting, and DHL tracking.

A customer job upload system allows customers to submit new job requests for staff review, with options for approval or rejection. Real-time chat and email notifications facilitate communication. Staff can impersonate customers for support. Secure password generation and reset functionality with mandatory first-login resets are implemented for customer portal access. The system also generates weekly performance reports showing invoiced value and completed quantities. A public demo portal at `/demo` showcases customer portal features with server-side obfuscated job data for marketing, including a lead magnet modal.

A unified messaging system replaces per-job chat silos with a full inbox experience. Customers access `/customer/messages` to see all job conversations in one place, with unread badges on the dashboard "Messages" button and per-conversation unread counts. Staff access `/messages` via the sidebar (with unread badge) to view all customer conversations across all jobs. The `jobMessages` table tracks `readByStaff`/`readByCustomer` flags. Messages auto-refresh via polling. Customers can start conversations on any job (production or pending) via `/api/customer-portal/jobs/:jobId/messages/send`. Staff reply via `/api/staff/jobs/:jobId/messages` (POST/GET).

## Feature Specifications

-   **Weekly Performance Report Date Filtering**: Allows filtering of weekly performance reports by date range (preset options and custom date picker).
-   **Automatic Scheduling on Machine Assignment**: Line items auto-schedule upon machine assignment, finding the earliest available slot considering all constraints. Overdue jobs and jobs without dispatch dates are prioritized.
-   **Logo-Only Invoice Support**: Invoicing queue displays customers with approved logo setups, allowing invoicing for £10 per setup.
-   **Partial Production Tracking**: `production_entries` table tracks daily work progress on line items. Staff can record partial production, and weekly reports aggregate this data.
-   **Multi-User Customer Portal Support**: Allows multiple users per customer account with individual logins, active/disabled status, and password reset capabilities.
-   **Customer Portal Enhancements**: Includes a "View Pricing" button with a `PricingTableDialog` and 2026 pricing table.
-   **Job Creation Express Service Warning**: A warning for express service with surcharge for jobs meeting specific quantity and dispatch date criteria.
-   **Invoice Enhancements**: Invoice dates use "last Friday" logic. "Print DTF" maps to "DTF" item code for Xero with print size. Shipping descriptions are enhanced. Consolidated invoices sort jobs chronologically with shipping fees per job. Xero account codes: `4002` (Sales - Contract Embroidery) for all customers; `4006` (Sales Contract Embroidery PC) for PC Sports. Tax type is `OUTPUT2` (20% VAT) on all lines.
-   **Production Worksheet Printing**: Enhanced print layout for multi-page printing with intelligent page-break controls.
-   **Auto-Scheduling Improvements**: Case-insensitive job type handling, overdue jobs prioritized, undated jobs scheduled within 30 days, default work hours (7 AM - 6 PM, Mon-Fri) used when no staff shifts configured, and improved error messages.
-   **Contract Embroidery Trend Chart**: Weekly Reports includes a "Contract Embroidery" tab with a dual-axis line chart (worm chart) showing weekly production output (items completed) on the left axis and invoice value (£) on the right axis. Supports date range filtering with preset options (This Week, Last Week, Last 4 Weeks, Last 12 Weeks) and custom date picker.
-   **Direct Messaging**: Staff and customers can have direct (non-job-tied) conversations. `conversations`/`conversationMessages` tables with `readByStaff`/`readByCustomer` flags. Staff access `/messages` (with a "Direct Messages" tab added to the existing job chats). Customers access via the "Messages" button in the portal (also has a "Direct Messages" tab with a "New Message" button). Staff can initiate conversations from `/messages`.
-   **Sample Approvals**: Staff can send samples to customers for review via `/samples`. Samples have `pending_approval`, `amends_required`, and `approved` statuses. Staff can attach files (via Object Storage), mark approved, or delete. Customers access their samples via `/customer/samples` — they can approve or request amends with notes. Tables: `samples`, `sampleFiles`.
-   **Machine Management**: A `machines` table stores each embroidery machine with name, heads (production capacity), stitches/minute, changeover time, and `isActive` (online/offline). Staff access `/machines` ("Machine Settings" in sidebar) to edit these per-machine. The sidebar machines section shows a live online/offline dot indicator for each machine. Machine dropdowns in job creation, editing, and scheduling dialogs use live DB data and show offline machines as disabled. Machines are seeded on startup if the table is empty.

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
-   **Authentication**: Email/password with bcrypt, Express sessions
-   **State Management**: TanStack React Query
-   **Routing**: Wouter
-   **External APIs**: Xero API, Resend (for email notifications)