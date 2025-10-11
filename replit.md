# Production Management App

## Overview

This application is a production management system designed to track customer orders, schedule machines, and manage dispatch deadlines within a manufacturing workflow. It facilitates monitoring jobs across multiple machines, ensuring timely completion of orders, and providing a comprehensive overview of the production process. Key capabilities include multi-line item job tracking with per-item specifics like stitch count and logo approval, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The project aims to streamline manufacturing operations, improve efficiency, and enhance customer order fulfillment.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend utilizes React with TypeScript, built with Vite. It employs `shadcn/ui` (based on Radix UI) and Tailwind CSS for styling, adhering to Material Design principles with a minimalist aesthetic, and supports light/dark modes. State management is handled by TanStack React Query for server state and React Hook Form with Zod for form validation. The architecture is component-based, responsive, and prioritizes accessibility.

### Backend Architecture

The backend is built with Express.js on Node.js, using TypeScript for type safety. It follows a RESTful API design. Authentication is managed via Replit Auth (OpenID Connect) with session-based authentication and Passport.js. API routes are designed for CRUD operations on customers, jobs, staff, and provide integration status for Xero. Request/response validation uses Zod schemas, and routes are protected by authentication middleware.

### Data Storage

The application uses PostgreSQL (Neon serverless database) with Drizzle ORM for type-safe operations. The schema includes tables for sessions, users, customers, staff, and jobs, with foreign key constraints ensuring data integrity. A `DatabaseStorage` class implements a repository pattern for abstracting data access.

### UI/UX Decisions

- **Customer Color Coding**: Jobs are visually differentiated by customer using unique light pastel colors, applied as a left border and background. This prioritizes overdue jobs (red), then customer colors, and finally "due today" jobs (amber ring accent).
- **Production Metrics Display**: The dashboard displays calculated "Runs," "Time/Run," and "Total Time" for jobs, based on machine specifications and stitch counts.
- **Interactive Scheduling**: Features an interactive timeline view for machine and staff schedules, with conflict detection and automated slot finding.
- **Tooltips**: Extensive use of tooltips for displaying job notes and line item breakdowns for enhanced information access.
- **Dashboard Summaries**: Urgent orders (overdue, due today) are highlighted in summary sections at the top of the dashboard.
- **Accessibility**: All dialog components include `DialogDescription` for screen reader support, and interactive elements are designed for keyboard accessibility.

### Feature Specifications

- **Multi-Line Item Jobs**: Supports multiple line items per job, each with its own quantity, stitch count, and logo approval status. Line items are immutable post-creation.
- **Job Scheduling System**: Combines machine availability and staff shifts to schedule jobs, preventing double-bookings and finding optimal slots. Includes UI for managing shifts and machine downtime.
- **Simplified Staff Shift System**: Staff shifts redesigned for efficiency - ONE shift record can now apply to multiple days via a `recurringDaysOfWeek` array (e.g., [1,2,3,4,5] for Mon-Fri). This eliminates duplicate shift records and simplifies management. The UI features day checkboxes with Mon-Fri/Mon-Sat quick select buttons and a recurring toggle. Backend and frontend validation ensures recurring shifts must have at least one day selected.
- **Customer Pricing Tables**: Customers can be marked with 2025 or 2026 pricing tables for accurate quote generation based on stitch count and quantity.
- **Staff and Customer Management**: Full CRUD operations for staff members and customers, including contact details.
- **Production Calculations**: Calculates production runs, time per run (including changeover), and total production time based on stitch count and machine specifications.
- **Optional Fields**: PO Number is optional; job notes are supported.

## Recent Changes

### October 11, 2025

#### User Management System and Super Admin Role
- Added **super_admin** role to the user roles hierarchy (super_admin > admin > manager > staff)
- Created User Management page accessible only to super admins
- Super admins can view all users and edit their roles through a dedicated interface
- Secure backend with authentication and authorization middleware
  - GET /api/users requires super admin authentication
  - PATCH /api/users/:id/role requires super admin authentication
  - Role validation ensures only valid roles can be assigned
- Created default super admin user "Chris" (chris@selectuniforms.com)
- User Management link conditionally appears in sidebar for super admins only

#### Staff Member Enhancements
- Added **email** and **telephone** fields to staff schema
- Added optional **userId** field to link staff members to user accounts
- Updated StaffFormDialog to include email and telephone inputs
- Staff members now have complete contact information for better communication

#### Role-Based Price Visibility
- Added role-based access control for pricing information
- Three user roles: Admin, Manager, Staff (default)
- **Price Visibility Rules**:
  - Admin and Manager: Can view all pricing (unit prices and total prices)
  - Staff: Cannot view pricing information (prices hidden with "-")
- Unit prices displayed for each line item in tooltips when hovering over quantity
- Total job price displayed in production queue Price column
- User role stored in `users.role` column with default value "staff"
- Helper function `canViewPrices(userRole)` determines visibility
- Pricing displays as "-" for users without price viewing permissions

#### Line Item Editing Improvements
- Fixed line item editing for jobs without existing line items (legacy jobs)
- Automatically creates default line item from job quantity for older orders
- Full CRUD operations on line items (create, update, delete) with proper persistence
- Added toast notifications for success/error feedback
- Improved cache management with `refetchOnMount: 'always'` for fresh data
- Line items now properly editable across all production orders

#### Line Item Validation Fix
- Fixed 400 error when updating jobs with line items that have null descriptions
- Changed `updateJobLineItemSchema` description field to `z.string().nullable().optional()`
- Now properly handles: null (clear field), string (update), undefined (no change)
- Allows users to successfully edit job dates and clear line item descriptions without validation errors

#### Production Queue Status Indicators
- Added traffic light indicators to production queue for quick visual status assessment
- **Logo Approval Indicator**: Green circle when all line items have logos approved, red otherwise
- **Date Received Indicator**: Green circle when date received exists, red when missing
- Tooltips on indicators show detailed line item information
- Improves at-a-glance visibility of order status in production queue

#### Form Reorganization and Line Item Completion Tracking
- **Required Dispatch Date prominence**: Moved to top of job creation/edit forms with color-coded urgency indicators
  - Red background and "OVERDUE" label for past dates (not today)
  - Amber background and "DUE TODAY" label for current day deadlines
  - Improves visibility of critical dispatch deadlines
- **Granular Line Item Completion**: Added completion checkbox ("Done") to each line item
  - Database schema includes `completed` boolean field on job_line_items table (default false)
  - Each line item can be individually marked as complete
  - Compact UI with "Logo" and "Done" checkboxes side-by-side for each line item
- **Order Completion Gating**: Order cannot be marked complete until all line items are completed
  - Order Completed checkbox disabled with helper text when line items incomplete
  - Prevents premature order closure and ensures all items are tracked to completion
  - Enforces proper completion workflow in manufacturing process

## Recent Changes (October 10, 2025)

### Pricing Tables Integration (2025 & 2026)
- Implemented both 2025 and 2026 pricing data structures in `shared/pricing.ts`
- **2025 Pricing**: Quantity tiers (1-15, 16-99, 100-299, 300-599, 600-999) with stitch ranges including <3000
- **2026 Pricing**: Quantity tiers (1-6, 7-99, 100-299, 300-599, 600-999) with expanded stitch ranges up to 50,000
- Supports POA (Price on Application) for high stitch counts (50,000+)
- Functions: `getPrice()`, `calculateJobPrice()`, `formatPrice()`
- Boundary-tested with strict `<` comparisons for accurate tier matching
- Customers can be marked with their pricing table (2025 or 2026) for accurate quote generation

### Job Creation Pricing Integration
- Added real-time pricing calculation to job creation workflow
- Pricing automatically displays based on selected customer's pricing table
- Shows per-line-item pricing (unit price and total) for each line item
- Calculates and displays total job price with POA handling
- Warning message when customer has no pricing table configured
- Pricing updates automatically when line items are modified
- All prices formatted as £X.XX currency

### Staff Shifts Display Fix
- Fixed day of week column in schedule management showing empty values
- Now correctly displays comma-separated recurring days (e.g., "Monday, Tuesday, Wednesday")
- Uses `recurringDaysOfWeek` array from schema instead of singular property

### Staff Machine Allocations System
- New `staffMachineAllocations` table for tracking staff assignments to specific machines
- Supports recurring allocations with day-of-week selection (similar to staff shifts)
- UI features day checkboxes with Mon-Fri/Mon-Sat quick select buttons
- Added "Staff Allocations" tab to Schedule Management page
- Full CRUD operations: create, edit, delete staff machine allocations
- Backend validation ensures recurring allocations have at least one day selected
- Enables tracking which staff members operate which machines on specific days

### Dashboard Pricing Display
- Added "Price" column to production queue dashboard
- Displays calculated job prices based on customer's pricing table (2025/2026)
- Shows £X.XX format for standard pricing
- Shows "-" when customer has no pricing table configured
- Shows "POA" for Price on Application cases (50,000+ stitches)
- Pricing calculated using weighted stitch counts from all line items
- Provides at-a-glance cost visibility for all jobs in the queue

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
- **External APIs**: Xero API (planned integration for invoice creation)