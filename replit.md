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