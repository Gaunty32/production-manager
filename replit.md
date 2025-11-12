## Overview

This application is a production management system for manufacturing, featuring both staff and customer portals. It tracks customer orders, schedules machines, and manages dispatch deadlines to streamline operations, improve efficiency, enhance customer satisfaction, and provide operational transparency. Key capabilities include multi-line item job tracking, a robust scheduling system integrating machine and staff availability, and detailed production metrics.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### November 12, 2025

**Customer Portal Enhancements:**
- Added mobile-optimized responsive layout for customer dashboard
  - Card-based layout on mobile (< 768px) with vertical stacking
  - Table layout on desktop (>= 768px) with all columns
  - Automatic breakpoint switching for optimal viewing experience
- Added DHL tracking number display for completed orders
  - Highlighted tracking box with copy-to-clipboard on mobile
  - Clickable DHL tracking links opening in new tab
  - URL encoding for safe handling of special characters
  - Proper data-testid attributes for testing
- Implemented search functionality across job name, PO number, descriptions, and notes
- Added sorting options: Production Date (default), Job Name (A-Z), Quantity (largest first)
- Search and sort controls responsive on mobile with full-width inputs

**Dashboard KPI Fixes:**
- Fixed "Overdue / Due Today" card to show total quantities instead of job count
- Fixed "Due in 3 Days" card to show total quantities instead of job count
- KPI cards now correctly sum all line item quantities for accurate production metrics
- Added proper data-testid attributes for testing KPI values

**Code Quality:**
- All interactive elements properly instrumented with data-testid attributes
- Removed hardcoded sizing from buttons (use shadcn size variants)
- Proper URL encoding for all tracking links (encodeURIComponent)
- Implementation follows shadcn component guidelines

### November 11, 2025

**Customer Portal Job Visibility & UI Improvements:**
- Fixed bug where customer portal only showed jobs in 'production' or 'completed' status
- Customer portal now displays ALL jobs except those in 'pending_customer_approval' status
- Removed "Machine" column from customer portal dashboard (internal info customers don't need)
- Renamed "Date Required" to "Production Date" for better clarity
- Replaced arrow symbol (↳) with actual Job Name on all line item rows
- Goods Received status, Production Date, and Status badge now display on every line item row
- PO Number and Notes display only on first row for cleaner presentation
- Added "Forgot your password?" link on customer login page with contact information dialog
- Implementation in server/routes.ts at /api/customer-portal/jobs endpoint and client/src/pages/CustomerDashboard.tsx

**Customer Impersonation - Complete Implementation:**
- Full customer impersonation feature allowing super_admin staff to view customer portal as any customer
- Fixed 403 "super admin access required" error by properly fetching user from database
- Single-use cryptographically secure tokens (SHA-256 hashed, 10-minute expiry)
- ImpersonationBanner component displayed across all customer portal pages (Dashboard, SubmitJob, PendingJobs, JobDetail)
- Session properly sets both customerUserId and impersonationCustomerUserId for backward compatibility
- Exit button clears all session keys and returns staff to Customers page
- usePermissions hook actively queries /api/customer-auth/user with staleTime: 0 for real-time impersonation state
- Backend routes: POST /api/staff/customers/:id/impersonate, GET /customer/impersonate/:token, DELETE /api/customer-impersonation
- Architect-verified implementation with no security vulnerabilities

**Secure Password Management for Customer Portal:**
- Auto-generate cryptographically secure 12-character passwords when creating customer portal logins
- Reset password functionality for existing customer accounts with new secure password generation
- Password generation uses window.crypto.getRandomValues() with rejection sampling to eliminate modulo bias
- Guarantees inclusion of all character classes (lowercase, uppercase, digit, special character)
- Uses unbiased Fisher-Yates shuffle with rejection sampling for secure character positioning
- Show/hide password toggle and copy-to-clipboard functionality for easy password sharing with customers
- Backend sets mustResetPassword flag when staff resets passwords, forcing customers to change on first login
- Implementation in CustomerUserDialog.tsx and ResetPasswordDialog.tsx components
- Backend endpoint: POST /api/customer-users/:id/reset-password with bcrypt hashing (10 rounds)
- Architect-verified as production-ready with no security vulnerabilities

**Customer Portal Status Visibility:**
- Added visual indicators on Customers page to show which customers have/don't have portal logins
- Orange "No Portal Login" badge with alert icon for customers without portal setup
- Filter buttons to view: All customers, Has Portal, or No Portal (with live counts)
- Context-aware empty states when filtering shows no results
- Makes it easy for staff to identify which customers need portal login setup
- Implementation in client/src/pages/Customers.tsx with memoized filtering for performance

**Consolidated Shipment Invoicing Fix:**
- Fixed bug where multiple shipping charges were created instead of one per consolidated shipment
- Backend now groups jobs by `consolidatedShipmentId` before generating Xero invoice line items
- Shipping costs are summed for all jobs in each shipment group
- Creates exactly ONE "CARRIAGE" line item per shipment group with total cost
- Description indicates "(Consolidated)" for multi-job shipments with all job names listed
- Handles edge cases: null consolidatedShipmentId, TBA shipping, zero costs, customer collection
- Implementation in server/routes.ts at /api/xero/consolidated-invoice endpoint (lines 2239-2319)

### November 10, 2025

**Weekly Performance Report:**
- Added weekly performance report feature showing invoiced value and completed quantities
- New page at /reports/weekly with 12-week default view
- Added invoice_total field to jobs schema for storing calculated invoice amounts
- Backend aggregation uses SQL CTEs with proper timezone handling (Europe/London default)
- Route protected with canViewPrices authorization check
- Input validation for weeks (1-52 range), timezone (10 supported zones), and date parameters
- Frontend displays total invoiced value, total completed quantity, and weekly breakdown table
- Comprehensive error handling with 400/403/500 responses

**Xero Integration - Item Code Fix:**
- Added `itemCode` field to Xero invoice line items (was previously intentionally excluded)
- Item codes now sent to Xero: "Emb" (embroidery), "Carriage" (shipping), "Print DTF", "BAG", "OTHER"
- Updated both single invoice and consolidated batch invoice functions
- Item codes must match exactly in Xero Chart of Accounts → Item Codes for proper categorization

**Production Display - Public Access & SQL Fixes:**
- Removed authentication requirement from Production Display page (/production-display)
- Moved route to public section in App.tsx router (alongside /forgot-password, /customer/*)
- Fixed SQL errors in production queue query (invalid UNION ORDER BY clause)
- Fixed SQL errors in leaderboard query (nested aggregate functions)
- Production Display now accessible without login for factory big screen displays
- E2E tested and verified working with proper empty states

## System Architecture

### UI/UX Decisions

The application employs Material Design principles with a minimalist aesthetic, supporting light/dark modes. Jobs are color-coded by customer, with overdue and "due today" jobs highlighted. The dashboard displays KPIs and an interactive scheduling timeline with conflict detection. Extensive tooltips provide job notes and line item breakdowns. The UI is mobile-responsive, adjusting layouts for different screen sizes. The dashboard features a card-based "scorecard" for KPIs that act as clickable filters. The main "Production Queue" displays all non-completed jobs, with one row per line item, grouped by job and sharing customer color coding and urgency indicators. A collapsible "Completed Orders" section shows invoiced jobs.

A dedicated "Production Display" (Big Screen View) is optimized for manufacturing floors, featuring a split-screen layout showing a 7-day production queue and a 30-day rolling leaderboard. It auto-refreshes every 2.5 minutes and uses large text for distant visibility.

### Technical Implementations

The frontend is built with React, TypeScript, Vite, `shadcn/ui`, and Tailwind CSS, using TanStack React Query for server state and React Hook Form with Zod for validation. The backend uses Express.js with Node.js and TypeScript, following a RESTful API design. Authentication is email/password-based with bcrypt and session management. Data is stored in a PostgreSQL database (Neon) using Drizzle ORM, with Zod schemas for request/response validation.

The system supports multi-line item jobs with independent machine assignment, quantity, stitch count, and logo approval. A "quacking duck" validation alerts staff when quantity exceeds stitch count for specific job types. The scheduling system combines machine availability and staff shifts, offering per-line-item schedule suggestions. Customer pricing tables enable accurate quote generation, including flat-rate and tiered pricing, with manual pricing for high-volume orders.

A complete invoicing workflow moves completed jobs to a draft queue, groups them by customer, and consolidates them into batch invoices with automatic Xero API integration. Invoice dates and due dates are automatically calculated. Xero invoice line items are professionally formatted, with intelligent contact matching. Automated tiered shipping cost calculations and consolidated shipment functionality are included. A logo setup queue tracks customer logo approvals, automatically adding a £10 charge upon approval.

A gamification system tracks staff performance with a star system and leaderboard, showing on-time/late completions and normalized stitches per head-hour. A "Daily Production" view provides per-staff breakdowns. User management, accessible by `super_admin` roles, allows creation, editing, and deletion of staff accounts. Line item completion tracking records the user and timestamp, allowing actual production time recording.

The production queue uses traffic light indicators for logo approval and goods received status. Job types include Embroidery, Print, Bagging, and Other, each with specific pricing logic. The customer portal provides a read-only interface for customers to view order status and line item details, filterable by status.

A customer job upload system allows customers to submit new job requests, which enter a staff review holding area. Jobs can be approved (moving to production) or rejected. Real-time chat with 3-second polling and email notifications (via Resend) facilitate communication between customers and staff regarding job submissions, approvals, and rejections. Email notifications are sent for new job submissions (to staff), and job approvals/rejections (to customers). New customer logins require a password reset, and staff can enable/disable customer portal access.

## External Dependencies

- **Database Service**: Neon Serverless PostgreSQL
- **ORM**: Drizzle ORM
- **Object Storage**: Replit Object Storage (Google Cloud Storage backend)
- **File Upload**: Uppy (@uppy/core, @uppy/aws-s3, @uppy/dashboard, @uppy/react)
- **UI Component Libraries**: `shadcn/ui`, Radix UI primitives, Embla Carousel, Lucide React
- **Date Utilities**: `date-fns`
- **Form Management & Validation**: React Hook Form, Zod, @hookform/resolvers
- **Styling**: Tailwind CSS, `class-variance-authority`, `clsx`, `tailwind-merge`
- **Build Tools**: Vite, esbuild
- **Authentication**: Email/password with bcrypt, Express sessions
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **External APIs**: Xero API, Resend (for email notifications)