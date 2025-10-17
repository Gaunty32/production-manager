## Overview

This application is a production management system designed to track customer orders, schedule machines, and manage dispatch deadlines within a manufacturing workflow. It aims to streamline manufacturing operations, improve efficiency, and enhance customer order fulfillment by providing a comprehensive overview of the production process. Key capabilities include multi-line item job tracking with per-item specifics, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The project envisions enhancing customer satisfaction and operational transparency in manufacturing.

## Recent Changes

**October 17, 2025 (Latest)**
- **NEW: Print Job Pricing Tables** - Added separate pricing tables for print jobs
  - Print jobs use size-based pricing (A6, A5, A4, A3) instead of stitch count
  - 2025 Print Pricing: 0-49 qty (A4=£2.00), 50-99 qty (A4=£1.75), 100+ qty (A4=£1.50)
  - 2026 Print Pricing: 0-49 qty (A4=£2.50), 50-99 qty (A4=£2.00), 100+ qty (A4=£1.75)
  - Print size selector replaces stitch count input for Print job types
  - Machine assignment not required for Print jobs (hidden in UI)
  - Default print size is A4 when creating new print jobs
  - Fixed UI reactivity bug: combined state updates to ensure React re-renders when changing job type to Print

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