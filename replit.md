# Overview

This application is a production management system for manufacturing, featuring both staff and customer portals. It tracks customer orders, schedules machines, and manages dispatch deadlines to streamline operations, improve efficiency, enhance customer satisfaction, and provide operational transparency. Key capabilities include multi-line item job tracking, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The system aims to provide a comprehensive solution for managing the entire production lifecycle, from order submission to invoicing and customer communication.

# Recent Changes (December 17, 2025)

## Logo-Only Invoice Support
- Invoicing queue now displays customers who have approved logo setups even if they have no completed jobs
- Customers with only logo setups show as separate cards with "X approved logo set-ups ready for invoicing"
- Create Invoice button enabled for logo-only customers to invoice £10 per approved logo setup
- Backend consolidated-invoice endpoint supports `logoSetupsOnly` flag for empty jobIds array
- Logo setups are deleted from database after successful invoice creation
- Cache invalidation for both jobs and logo-setups after invoice creation

# Previous Changes (December 16, 2025)

## Partial Production Tracking
- Added `production_entries` table to track daily work progress on line items that span multiple days
- Staff can now record partial production at end of day using the "Record Production" button (play icon) on each incomplete line item
- Production entries track: staff member, work date, quantity completed, and time spent
- Weekly production reports now aggregate data from both production entries (partial work) and completed line items
- System automatically prevents double-counting: line items with production entries use entry data, others use completion data
- RecordProductionDialog shows progress summary, previous entries, and allows recording new daily work

# Previous Changes (December 9, 2025)

## Multi-User Customer Portal Support
- Customer portal now supports multiple users per customer account (5+ users can access the same customer's data)
- Staff can create multiple portal logins for the same customer via "Create Portal Login" button
- Each portal user has individual login credentials, active/disabled status, and password reset capability
- Customers page displays all portal users per customer with inline enable/disable toggles
- Customer Change Password feature added to portal header - customers can update their own password (requires current password verification)

## Previous Changes (December 6, 2025)

## Customer Portal Enhancements
- Added "View Pricing" button to customer portal dashboard header with reusable PricingTableDialog component
- 2026 pricing table shows tiered pricing, standard production time (3-4 days for <300 items), and 48-hour express service (100% surcharge)

## Job Creation Express Service Warning
- Added express service popup warning when creating jobs with quantity <300 items and dispatch date <3 working days away
- Warning clearly explains the 100% surcharge for express production service
- Uses explicit confirmation flag passing to handle React state batching issues in the validation chain (duck dialog → machine warning → express warning → submit)

# Recent Changes (November 24, 2025)

## Invoice Enhancements
- Invoice dates now always use "last Friday" logic (most recent Friday from current date) for end-of-week invoicing cycles
- "Print DTF" jobs now map to "DTF" item code for Xero compatibility
- Print size (A3, A4, A5, A6) is now included in DTF print job descriptions sent to Xero
- Fixed pluralization in shipping descriptions ("boxess" → "boxes")
- Shipping line descriptions now include job names and PO numbers for better tracking
- Consolidated invoices now sort jobs chronologically by completion date (goodsReceived) with shipping fees appearing immediately below each job

## Production Worksheet Printing
- Enhanced print layout to support multi-page printing when job content is extensive
- Added intelligent page-break controls to prevent awkward breaks in critical sections (table rows, bordered boxes)
- Optimized header sizing for printing to be more compact while maintaining readability
- Content now flows naturally across multiple pages instead of being forced to fit on one page

## Auto-Scheduling Improvements
- Fixed case-sensitivity issue with job types ('Embroidery' vs 'embroidery')
- System now schedules overdue jobs ASAP (treats them as most urgent)
- Jobs without dispatch dates now get scheduled within 30 days
- Default work hours (7 AM - 6 PM, Mon-Fri) used when no staff shifts configured
- Better error messages explain why jobs couldn't be scheduled
- Jobs sorted by urgency: overdue first, then by dispatch date, undated jobs last

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions

The application employs Material Design principles with a minimalist aesthetic, supporting light/dark modes. Jobs are color-coded by customer, with overdue and "due today" jobs highlighted. The dashboard displays KPIs and an interactive scheduling timeline with conflict detection. Extensive tooltips provide job notes and line item breakdowns. The UI is mobile-responsive, adjusting layouts for different screen sizes. The dashboard features a card-based "scorecard" for KPIs that act as clickable filters. The main "Production Queue" displays all non-completed jobs, with one row per line item, grouped by job and sharing customer color coding and urgency indicators. A collapsible "Completed Orders" section shows invoiced jobs.

A dedicated "Production Display" (Big Screen View) is optimized for manufacturing floors, featuring a split-screen layout showing a 3-day production queue (excluding Sundays) and a 30-day rolling leaderboard with a stitches per hour line graph. It auto-refreshes every 2.5 minutes and uses large text for distant visibility. The historical line graph visualizes daily stitches per hour trends for each staff member over the past 30 days. Customer portal views are also mobile-optimized with card-based layouts for smaller screens and table layouts for larger screens.

## Technical Implementations

The frontend is built with React, TypeScript, Vite, `shadcn/ui`, and Tailwind CSS, using TanStack React Query for server state and React Hook Form with Zod for validation. The backend uses Express.js with Node.js and TypeScript, following a RESTful API design. Authentication is email/password-based with bcrypt and session management. Data is stored in a PostgreSQL database (Neon) using Drizzle ORM, with Zod schemas for request/response validation.

The system supports multi-line item jobs with independent machine assignment, quantity, stitch count, logo approval, and position (left chest, right chest, left sleeve, right sleeve, rear, or custom). A "quacking duck" validation alerts staff when quantity exceeds stitch count for specific job types. When all line items in a job are marked as completed (with required production time and staff information for embroidery jobs), the system automatically promotes the job to `invoiceStatus: 'ready'` and it appears in the draft invoice queue. If any line item is later marked incomplete, the job automatically reverts to `invoiceStatus: 'pending'` unless it has already been sent or paid (protecting completed invoices from accidental modification). 

The intelligent scheduling system automatically calculates production time from line item quantity and stitch count (formula: ceil((quantity × stitchCount) / 1000 / 60) minutes). It queries available time slots by checking machine blocks, staff shifts, staff-machine allocations, staff holidays, bank holidays, and existing schedules to suggest only conflict-free time slots. The scheduling dialog offers two workflows: (1) intelligent slot selection showing suggested conflict-free times, and (2) manual time entry for custom scheduling or when no slots are available. Staff-machine allocations restrict which machines staff can operate during specific times. The system supports both per-line-item scheduling and legacy job-only scheduling. A holiday management system tracks staff holidays (holiday, sick leave, other) and bank holidays (company-wide closures), automatically excluding these periods from available scheduling slots. Customer pricing tables enable accurate quote generation, including flat-rate and tiered pricing, with manual pricing for high-volume orders.

A complete invoicing workflow moves completed jobs to a draft queue, groups them by customer, and consolidates them into batch invoices with automatic Xero API integration. Invoice dates are automatically set to the most recent Friday (reflecting end-of-week invoicing), and due dates are calculated as the 5th of the following month. Xero invoice line items are professionally formatted, with intelligent contact matching and item code integration. Item codes are conditionally included: recognized codes (Emb, Print DTF, BAG, Carriage) are sent to Xero, while "OTHER" codes are omitted to prevent validation errors. 

The carriage charge system groups jobs by consolidatedShipmentId and emits a single carriage line after the final job in each shipment group, preserving the original job order. Jobs sharing the same consolidatedShipmentId receive one combined carriage charge regardless of their position in the invoice, while jobs without a consolidatedShipmentId receive individual carriage charges. A pre-computed index map tracks the last occurrence of each shipmentId, and an accumulator map builds the shipment group during iteration. When processing reaches the last index for a shipmentId, the system emits the carriage and clears the accumulator to prevent duplicates. A logo setup queue tracks customer logo approvals, automatically adding a £10 charge upon approval.

A gamification system tracks staff performance with a star system and leaderboard, showing on-time/late completions and normalized stitches per head-hour. A "Daily Production" view provides per-staff breakdowns. 

User management, accessible by `super_admin` roles, allows creation, editing, role assignment, activation/deactivation, and password reset for staff accounts. Super admins can activate or deactivate user accounts, with deactivated users (active: false) blocked from logging in and existing sessions invalidated immediately. Users cannot deactivate their own accounts for safety. Super admins can trigger password reset emails for any user, allowing them to securely reset user passwords via email link. Line item completion tracking records the user, timestamp, and actual production time. Job total actual production time is automatically calculated from the sum of all completed line items' production times, eliminating manual entry.

The production queue uses traffic light indicators for logo approval and goods received status. Job types include Embroidery, Print, Bagging, and Other, each with specific pricing logic. The customer portal provides a read-only interface for customers to view order status and line item details, filterable by status, with search and sorting capabilities, and DHL tracking number display.

A customer job upload system allows customers to submit new job requests, which enter a staff review holding area. Jobs can be approved (moving to production) or rejected. Real-time chat with 3-second polling and email notifications facilitate communication between customers and staff regarding job submissions, approvals, and rejections. Staff can impersonate customers for support. Secure password generation and reset functionality with mandatory first-login resets are implemented for customer portal access. The system also includes a weekly performance report showing invoiced value and completed quantities.

A public demo portal at `/demo` showcases customer portal features for marketing purposes. It displays server-side obfuscated job data from JK Prints customer, protecting sensitive business information while demonstrating the interface. The demo includes a lead magnet modal that appears after 10 seconds, prompting visitors to learn about outsourced production services. All obfuscation happens server-side to prevent data leakage through browser network panels.

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