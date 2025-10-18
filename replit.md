## Overview

This application is a production management system designed to track customer orders, schedule machines, and manage dispatch deadlines within a manufacturing workflow. It aims to streamline manufacturing operations, improve efficiency, and enhance customer order fulfillment by providing a comprehensive overview of the production process. Key capabilities include multi-line item job tracking with per-item specifics, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The project envisions enhancing customer satisfaction and operational transparency in manufacturing.

## Recent Changes

**October 18, 2025 (Latest)**
- **IMPROVED: Consolidated Shipment Workflow** - Streamlined process for joining existing consolidated shipments
  - First job creates consolidated shipment with full shipping details (tracking number, package count/type, shipping cost)
  - Subsequent jobs can join existing shipment by selecting it from dropdown
  - Shipping details (DHL tracking, package count/type) auto-populated from selected shipment
  - Fields become read-only when joining existing shipment
  - Only primary job (first in shipment) has shipping cost; additional jobs have zero shipping cost
  - Prevents duplicate tracking numbers and ensures single shipping charge per physical shipment
  - Dropdown shows existing shipments with tracking info for easy selection

**October 17, 2025**
- **NEW: Consolidated Shipment Tracking** - Multiple completed jobs can now be shipped together in one delivery
  - Added consolidatedShipmentId field to link jobs in the same physical shipment
  - When marking job complete with "Consolidated Back to Customer", can select other completed jobs to ship together
  - All jobs in shipment share same tracking number, package count/type, and shipment ID
  - Only primary job (being marked complete) has shipping cost to avoid duplication in invoicing
  - Draft Invoicing Queue shows visual indicator (blue left border) for consolidated jobs
  - Displays which jobs are consolidated together with "Consolidated with: [job names]" text
- **NEW: Shipping Cost Pricing for Boxes and Bags** - Implemented automated shipping cost calculation with tiered pricing
  - Box pricing: 1 box=£7.50, 2 boxes=£10, 3 boxes=£15, 4 boxes=£20, >4 boxes=TBA (requires manual quote)
  - Bag pricing: Restricted to quantity 1, cost £0
  - Real-time cost display in ShippingInfoDialog with visual feedback
  - Shipping costs stored in database and included in Draft Invoicing Queue totals
  - Xero invoices include shipping as separate line item with descriptive text
  - Invoice creation blocked when shipping cost is TBA (>4 boxes)
  - Customer collection has zero shipping cost
- **FIXED: Draft Invoicing Queue Pricing for Mixed Job Types** - Resolved crash when calculating prices for orders with both Print and Embroidery line items
  - Added missing jobType field to LineItem interface in InvoicingQueue component
  - Now correctly routes Print jobs through print pricing and Embroidery jobs through embroidery pricing
  - Mixed job type orders (e.g., Spirit of Sussex with Print + Embroidery) now display correct totals
- **FIXED: Star Award System** - Stars now correctly awarded to employees who completed line items
  - Changed from awarding stars to person marking order complete to employees who completed each line item
  - Each unique staff member who completed line items receives one star (yellow if on time, red if late)
  - Staff members without linked user accounts are still recognized in celebration dialog with console warning
  - Celebration dialog now shows names of all staff members who completed line items
- **NEW: Package Count and Type Tracking** - Enhanced shipping information to capture package details
  - Added package count field (number of boxes/bags) for Consolidated and Direct Delivery shipments
  - Added package type selector (Boxes or Bags)
  - Package information required for Consolidated Back to Customer and Direct Delivery methods
  - Not required for Customer Collection
  - Package details display in Draft Invoicing Queue with proper singular/plural formatting
- **NEW: Print Job Pricing Tables** - Added separate pricing tables for print jobs
  - Print jobs use size-based pricing (A6, A5, A4, A3) instead of stitch count
  - 2025 Print Pricing: 0-49 qty (A4=£2.00), 50-99 qty (A4=£1.75), 100+ qty (A4=£1.50)
  - 2026 Print Pricing: 0-49 qty (A4=£2.50), 50-99 qty (A4=£2.00), 100+ qty (A4=£1.75)
  - Print size selector replaces stitch count input for Print job types
  - Machine assignment not required for Print jobs (hidden in UI)
  - Default print size is A4 when creating new print jobs
  - Fixed UI reactivity bug: combined state updates to ensure React re-renders when changing job type to Print
  - Fixed pricing summary to show correct job type and details (Print shows size, Embroidery shows stitches)

**October 16, 2025**
- **NEW: Manual Pricing for High-Volume Orders** - Orders with 1000+ units or 50,000+ stitches now require manual price entry
  - Draft Invoicing Queue shows manual price input fields for qualifying line items
  - Invoice creation validates that all manual prices are entered before proceeding
  - Supports custom pricing for orders outside standard pricing tables
  - Clear visual indicators show which items need manual pricing (quantity/stitch count thresholds)
- **NEW: Invoice Description Format** - Updated Xero invoice line item descriptions to show professional format
  - Format: "Job Name, X Stitches (PO: Y)" when PO number exists
  - Format: "Job Name, X Stitches" when no PO number
  - Capitalized "Stitches" and removed quantity duplication from description
  - Quantity now only appears in Xero quantity field (not description)
- **NEW: Intelligent Xero Contact Matching** - Invoices now automatically match to existing Xero contacts using multi-field lookup
  - First attempts exact name match, then email match, then phone number match
  - Ensures invoices use existing customer records with pre-configured account details and payment terms
  - Prevents duplicate contacts in Xero
  - Console logging shows which field was used for matching (name/email/phone)
- **FIXED: Production Queue Filtering** - Production Queue now only shows pending orders (invoiceStatus='pending'), excluding completed orders that are ready for invoicing or already invoiced
- **NEW: Shipping Information Tracking** - Added shipping method and DHL tracking number capture when marking orders complete
  - Three shipping methods: Customer Collection, Consolidated Back to Customer, Direct Delivery
  - DHL tracking number required for consolidated and direct delivery methods
  - Shipping information displays in Draft Invoicing Queue
  - Validation ensures tracking numbers are captured when required
- **NEW: Xero Invoice Defaults** - Configured automatic tax and account settings for Xero invoices
  - Account Code: 4002 (applied to all invoice line items)
  - Tax Type: OUTPUT2 (20% VAT on income)
  - Item Code: EMB (Embroidery)
- Fixed "Mark Order as Completed" 500 error - now correctly uses staff ID instead of user ID for completedById field
- Added automatic lookup of staff member associated with logged-in user when marking orders complete
- Fixed pricing calculation crash causing app to freeze - added error handling in JobRow component
- Changed customer pricing tables to be mutually exclusive - replaced checkboxes with radio buttons (None/2025/2026)
- Added validation to prevent marking orders complete if user is not associated with a staff member

**October 16, 2025 (Earlier)**
- Fixed double-click submission bug in JobFormDialog and JobEditDialog using isSubmitting state guard
- Fixed job quantity not updating when line items change - now recalculates total from line items on every edit
- Submit buttons now disabled during async operations with visual feedback ("Creating..."/"Saving...")
- Customer dropdown now only shows customers with pricing tables when creating orders
- Added helper text showing count of hidden customers without pricing tables

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The application adheres to Material Design principles with a minimalist aesthetic, supporting light/dark modes. Jobs are visually differentiated by customer using unique light pastel colors, with overdue jobs prioritized (red) and "due today" jobs highlighted with an amber ring. The dashboard displays calculated "Runs," "Time/Run," and "Total Time" for jobs. An interactive timeline view facilitates machine and staff scheduling with conflict detection. Extensive tooltips provide job notes and line item breakdowns. Urgent orders are highlighted on the dashboard. All dialog components are accessible with `DialogDescription`, and interactive elements are keyboard-friendly. Role-based visibility ensures Admin and Manager roles can view pricing, while Staff cannot. Customer lists are card-based for better space utilization, especially for addresses, and visually indicate pricing tables (e.g., orange background for 2025 pricing).

### Technical Implementations

The frontend uses React with TypeScript, Vite, `shadcn/ui`, and Tailwind CSS. State management is handled by TanStack React Query for server state and React Hook Form with Zod for form validation. The backend is built with Express.js on Node.js, using TypeScript, following a RESTful API design. Authentication is managed via Replit Auth (OpenID Connect) with session-based authentication and Passport.js. Request/response validation uses Zod schemas. Data storage uses PostgreSQL (Neon serverless database) with Drizzle ORM.

### Feature Specifications

The system supports multi-line item jobs, where each item has quantity, stitch count, logo approval, individual completion tracking, and independent machine assignment. Line items are immutable post-creation. A robust scheduling system combines machine availability and staff shifts, preventing double-bookings, with simplified staff shift management using recurring days. Per-line-item schedule suggestions are available based on machine assignment. Customer pricing tables (2025/2026) enable accurate quote generation. Full CRUD operations are available for staff and customers. Production calculations derive runs, time per run, and total production time. PO numbers are optional, and job notes are supported.

A complete invoicing workflow is implemented, moving completed jobs to a draft queue for review, grouping by customer, and consolidating into batch invoices with automatic Xero API integration. A gamification system tracks staff performance with a star system and a leaderboard. A `super_admin` role provides user management and role editing. Production queue status is indicated by traffic light indicators for logo approval and goods received status. The required dispatch date is prominently displayed with color-coded urgency. Line items can be classified by job type (Embroidery, Print, Bagging, Other), with pricing currently only calculated for Embroidery types. "Date Received" has been renamed to "Goods Received," and the system calculates and visually indicates production time, highlighting urgent orders. Job completion is managed via a button that requires all line items to be completed first, with automatic status resets if line items become incomplete. The goods received date field is optional and can be left empty.

## External Dependencies

- **Database Service**: Neon Serverless PostgreSQL
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