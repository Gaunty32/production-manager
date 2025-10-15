# Production Management App

## Overview

This application is a production management system designed to track customer orders, schedule machines, and manage dispatch deadlines within a manufacturing workflow. It aims to streamline manufacturing operations, improve efficiency, and enhance customer order fulfillment by providing a comprehensive overview of the production process. Key capabilities include multi-line item job tracking with per-item specifics, a robust scheduling system integrating machine and staff availability, and detailed production metrics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The application adheres to Material Design principles with a minimalist aesthetic, supporting light/dark modes.
- **Customer Color Coding**: Jobs are visually differentiated by customer using unique light pastel colors. Overdue jobs are prioritized (red), followed by customer colors, and "due today" jobs (amber ring accent).
- **Production Metrics Display**: The dashboard displays calculated "Runs," "Time/Run," and "Total Time" for jobs.
- **Interactive Scheduling**: Features an interactive timeline view for machine and staff schedules, with conflict detection and automated slot finding.
- **Tooltips**: Extensive use of tooltips for displaying job notes and line item breakdowns.
- **Dashboard Summaries**: Urgent orders (overdue, due today) are highlighted.
- **Accessibility**: All dialog components include `DialogDescription` for screen reader support, and interactive elements are designed for keyboard accessibility.
- **Role-Based Price Visibility**: Admin and Manager roles can view all pricing; Staff cannot view pricing information (hidden with "-").

### Technical Implementations

The frontend uses React with TypeScript, Vite, `shadcn/ui`, and Tailwind CSS. State management is handled by TanStack React Query for server state and React Hook Form with Zod for form validation.
The backend is built with Express.js on Node.js, using TypeScript. It follows a RESTful API design. Authentication is managed via Replit Auth (OpenID Connect) with session-based authentication and Passport.js. Request/response validation uses Zod schemas.

### Data Storage

PostgreSQL (Neon serverless database) with Drizzle ORM is used for type-safe operations. The schema includes tables for sessions, users, customers, staff, and jobs, with foreign key constraints ensuring data integrity. A `DatabaseStorage` class implements a repository pattern for data access.

### Feature Specifications

- **Multi-Line Item Jobs**: Supports multiple line items per job, each with quantity, stitch count, and logo approval. Line items are immutable post-creation. Line items include individual completion tracking.
- **Job Scheduling System**: Combines machine availability and staff shifts to schedule jobs, preventing double-bookings.
- **Simplified Staff Shift System**: Allows one shift record to apply to multiple days via a `recurringDaysOfWeek` array, simplifying management.
- **Customer Pricing Tables**: Customers can be marked with 2025 or 2026 pricing tables for accurate quote generation based on stitch count and quantity. This includes POA (Price on Application) for high stitch counts.
- **Staff and Customer Management**: Full CRUD operations for staff members and customers.
- **Production Calculations**: Calculates production runs, time per run, and total production time based on stitch count and machine specifications.
- **Optional Fields**: PO Number is optional; job notes are supported.
- **Invoicing Workflow**: Implemented a complete invoicing workflow from job completion to Xero invoice generation. Completed jobs automatically move to a draft invoicing queue where they can be reviewed, grouped by customer, and consolidated into batch invoices. Supports multi-job consolidation for weekly invoice generation with automatic Xero API integration.
- **Gamification System**: Includes a star tracking system for staff performance (yellow for on-time, red for late completions) with a leaderboard.
- **User Management & Super Admin Role**: Introduces a `super_admin` role with a dedicated user management page for role editing.
- **Production Queue Status Indicators**: Traffic light indicators for logo approval and date received status.
- **Form Reorganization**: Required dispatch date is prominently displayed with color-coded urgency.

## External Dependencies

- **Database Service**: Neon Serverless PostgreSQL (@neondatabase/serverless)
- **ORM**: Drizzle ORM
- **UI Component Libraries**: `shadcn/ui`, Radix UI primitives, Embla Carousel, Lucide React
- **Date Utilities**: `date-fns`
- **Form Management & Validation**: React Hook Form, Zod, @hookform/resolvers
- **Styling**: Tailwind CSS, `class-variance-authority`, `clsx`, `tailwind-merge`
- **Build Tools**: Vite, esbuild
- **Authentication**: Replit Auth, Passport.js
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **External APIs**: Xero API (for invoice creation)

## Recent Changes

### October 13, 2025

#### Xero OAuth 2.0 Integration
- Implemented complete OAuth 2.0 flow for Xero accounting integration
- **Backend Implementation**:
  - Added OAuth endpoints: `/api/xero/auth/status`, `/api/xero/auth/connect`, `/api/xero/auth/callback`
  - Implemented automatic token refresh when access token expires (5-minute buffer)
  - Secure token storage in-memory during session (tokens include access_token, refresh_token, expires_at)
  - Authorization URL generation with required scopes: `accounting.transactions`, `accounting.contacts`, `offline_access`
  - Token exchange using client credentials (Client ID, Client Secret from environment secrets)
- **Frontend UI**:
  - Added Xero connection status badge and "Connect to Xero" button on Invoicing Queue page
  - Connection status indicator shows whether Xero is configured and connected
  - Alert notification when Xero is not connected
  - OAuth flow redirects to Xero login, returns to app with success/error message
  - Toast notifications for connection success/failure
- **Security**: Xero credentials (XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_TENANT_ID) stored as encrypted Replit Secrets
- **User Flow**: Click "Connect to Xero" → Authorize in Xero → Redirected back → Can create invoices
- **Next Step**: User needs to click the "Connect to Xero" button and authorize the app to enable invoice creation

### October 13, 2025

#### Production Queue Reorganization
- Split production queue into two sections: active orders and completed orders
- **Active Orders (Production Queue)**: Displays orders that have not been invoiced (invoiceStatus !== 'invoiced')
  - Shows edit and delete action buttons
  - Sorted by dispatch date (earliest first)
  - Remains the main focus area for active production work
- **Completed Orders Section**: Displays invoiced orders below the production queue
  - Shows invoice reference number instead of action buttons
  - Sorted by dispatch date (most recent first)
  - Only appears when completed/invoiced orders exist
  - Provides historical record of completed work
- **Workflow**: When an order completes and creates a draft invoice, the job's invoiceStatus updates to 'invoiced', causing it to automatically move from the production queue to the completed orders section
- **UI Improvement**: Cleaner production queue focused on active work, with completed orders archived in a separate viewable section

#### Customer List UI Enhancement
- Restructured customer list from table layout to card-based layout for better space utilization
- **Layout Change**: Replaced traditional table with Card components to accommodate address field more naturally
- **Card Structure**: 
  - Top section displays customer name and color-coded pricing table badges (blue for 2025, green for 2026)
  - Middle section shows contact details in responsive 3-column grid (Contact Name, Email, Phone)
  - Bottom section displays full address on its own row with proper spacing
  - Edit/Delete actions positioned on the right side of each card
- **Address Display**: Address now appears below contact information instead of in a cramped table column, providing natural flow and better readability for long addresses
- **Responsive Design**: Grid layout adapts from 1 column on mobile to 3 columns on desktop
- **Visual Improvement**: Eliminates the cramped appearance of address data in table format
- **2025 Pricing Indicator**: Cards with 2025 pricing table have an orange background (light orange in light mode, dark orange tint in dark mode) for instant visual identification

### October 15, 2025

#### Goods Received and Production Time Feature
- **Field Rename**: "Date Received" renamed to "Goods Received" across the application
- **Database Schema**: Column `date_received` renamed to `goods_received` in jobs table (data preserved via SQL rename)
- **Production Time Calculation**: System now calculates and displays production time (days between Goods Received and Required Dispatch Date)
  - Displayed prominently below Goods Received field with large, eye-catching typography
  - **Visual Indicators**:
    - Green border and background for normal production time (3+ days)
    - Red border and background for urgent orders (< 3 days)
    - Production time shown in large 2xl font for maximum visibility
  - **Urgent Order Alert**: Orders with less than 3 days production time display "⚠️ URGENT ORDER" warning
- **Form Layout**: Goods Received positioned directly under Required Dispatch Date for logical workflow
- **Reporting Metric**: Production time will be used for future production efficiency reporting
- **Implementation**: Available in both New Order and Edit Order dialogs

#### Form Layout and Terminology Updates
- **New Order Dialog Restructure**: Redesigned form hierarchy to emphasize critical fields
  - Required Dispatch Date is now the prominent header field (full width, larger text/button)
  - Customer, PO Number, and Job Name fields are now full width for better prominence
  - Fields arranged in priority order: Dispatch Date → Customer → PO Number → Job Name → Embroidery Approved → Line Items
- **Terminology Change**: Renamed "Logos Approved" to "Embroidery Approved" throughout application
  - Updated in JobFormDialog, JobEditDialog, and design guidelines
  - Changed from checkbox control to Yes/No dropdown selector for clearer approval status
  - Maintains functionality: controls approval status for all line items in a job

#### Job Type Classification for Line Items
- **Multi-Type Job Support**: Line items can now be classified by job type
- **Database Schema**: Added `job_type` field to `job_line_items` table with default value "Embroidery"
- **Job Type Options**: Embroidery, Print, Bagging, Other
- **UI Implementation**: Dropdown selector added as first field in each line item for both New Order and Edit Order dialogs
- **Data Migration**: Existing line items automatically default to "Embroidery" type
- **Purpose**: Enables tracking different types of work within a single job (e.g., embroidery + bagging services)
- **Pricing Limitation**: Current pricing tables (2025/2026) only apply to Embroidery work
  - Embroidery line items show calculated pricing based on stitch count and quantity
  - Print, Bagging, and Other job types display "Pricing not available" in pricing summary
  - Total price calculation only includes Embroidery line items
  - System clearly labels totals as "Total Price (Embroidery Only)" when mixed job types are present
  - Future enhancement: Add dedicated pricing tables for Print, Bagging, and Other services

### October 11, 2025

#### Customer Contact Name Fields Update
- Updated customer contact information to use separate first name and last name fields
- **Database Schema**: Changed from single `contact_name` field to `contact_first_name` and `contact_last_name` fields
- **Customer Form**: Form dialog now displays two separate input fields for contact first name and last name, arranged side by side
- **Display Logic**: Customer list combines both fields to show full contact name (e.g., "John Smith")
- **Data Migration**: Existing contact_name data preserved in contact_first_name field during migration
- Improves data organization and enables better contact name formatting

#### Leaderboard Production Metrics Enhancement
- Enhanced leaderboard to display production performance metrics alongside star counts
- **Production Metrics Calculation**: Calculates average stitches per head-hour (normalized by machine capacity), total stitches, and hours worked from completed jobs
- **Machine Head Normalization**: Accounts for whether staff work on 6-head or 8-head machines by calculating head-hours (hours × machine heads)
  - Machine 1 (Barudan 8): 8 heads
  - Machines 2, 3, 4 (Barudan/SWF): 6 heads
  - Formula: stitches per head-hour = totalStitches ÷ (hours × machineHeads)
- **Inclusive Display**: Staff members with production data now appear on leaderboard even with zero stars
- **Data Source**: Metrics calculated from `jobs.completedById`, `lineItems.stitchCount`, and `jobSchedules` time data with machine configuration from `MACHINE_HEADS`
- **Name Fallback**: System uses staff names when staff members aren't linked to user accounts
- **API Enhancement**: Leaderboard endpoint now starts with production metrics and left-joins star data
- **UI Updates**: Displays "stitches/head-hr" label and explains normalization in card description
- **Note**: Production metrics rely on `jobs.completedById` being populated; jobs without this field may not be included in calculations