## Overview

This application is a production management system designed to track customer orders, schedule machines, and manage dispatch deadlines within a manufacturing workflow. It aims to streamline manufacturing operations, improve efficiency, and enhance customer order fulfillment by providing a comprehensive overview of the production process. Key capabilities include multi-line item job tracking with per-item specifics, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The project envisions enhancing customer satisfaction and operational transparency in manufacturing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The application adheres to Material Design principles with a minimalist aesthetic, supporting light/dark modes. Jobs are visually differentiated by customer using unique light pastel colors, with overdue jobs prioritized (red) and "due today" jobs highlighted with an amber ring. The dashboard displays calculated "Runs," "Time/Run," and "Total Time" for jobs. An interactive timeline view facilitates machine and staff scheduling with conflict detection. Extensive tooltips provide job notes and line item breakdowns. Urgent orders are highlighted on the dashboard. All dialog components are accessible with `DialogDescription`, and interactive elements are keyboard-friendly. Role-based visibility ensures Admin and Manager roles can view pricing, while Staff cannot. Customer lists are card-based for better space utilization, especially for addresses, and visually indicate pricing tables (e.g., orange background for 2025 pricing).

### Technical Implementations

The frontend uses React with TypeScript, Vite, `shadcn/ui`, and Tailwind CSS. State management is handled by TanStack React Query for server state and React Hook Form with Zod for form validation. The backend is built with Express.js on Node.js, using TypeScript, following a RESTful API design. Authentication is managed via Replit Auth (OpenID Connect) with session-based authentication and Passport.js. Request/response validation uses Zod schemas.

### Data Storage

PostgreSQL (Neon serverless database) with Drizzle ORM is used for type-safe operations. The schema includes tables for sessions, users, customers, staff, and jobs, with foreign key constraints ensuring data integrity. A `DatabaseStorage` class implements a repository pattern for data access.

### Feature Specifications

The system supports multi-line item jobs, where each item has quantity, stitch count, logo approval, and individual completion tracking (completed by staff and date). Line items are immutable post-creation. A robust scheduling system combines machine availability and staff shifts, preventing double-bookings, with simplified staff shift management using recurring days. Customer pricing tables (2025/2026) enable accurate quote generation based on stitch count and quantity, including POA for high stitch counts. Full CRUD operations are available for staff and customers. Production calculations derive runs, time per run, and total production time. PO numbers are optional, and job notes are supported.

A complete invoicing workflow is implemented, moving completed jobs to a draft queue for review, grouping by customer, and consolidating into batch invoices with automatic Xero API integration. A gamification system tracks staff performance with a star system (yellow for on-time, red for late) and a leaderboard that also displays production metrics like stitches per head-hour. A `super_admin` role provides user management and role editing. Production queue status is indicated by traffic light indicators for logo approval and goods received status. The required dispatch date is prominently displayed with color-coded urgency. Line items can be classified by job type (Embroidery, Print, Bagging, Other), with pricing currently only calculated for Embroidery types. "Date Received" has been renamed to "Goods Received," and the system calculates and visually indicates production time (days between Goods Received and Required Dispatch Date), highlighting urgent orders.

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

### October 15, 2025

#### Goods Received Date Optional Field
- Updated goods received date field to default to blank/empty, allowing users to add jobs to the system before goods arrive
- **Schema Changes**:
  - Changed `goodsReceived` field in jobs table from `notNull()` to nullable
  - Fixed schema field name from legacy `dateReceived` to `goodsReceived` in both insert and update schemas
  - Allows jobs to be created without a goods received date
  - Allows users to clear the goods received date when editing existing jobs
- **Form Updates**:
  - Both JobFormDialog and JobEditDialog now default to empty string for goods received date
  - Calendar picker shows "Pick a date" placeholder when field is empty
  - Updated insert schema validation: converts empty string to null using Zod preprocessing
  - Updated update schema validation: converts empty string to null (not undefined) for proper field clearing
  - Fixed calendar onChange handlers to send empty string when date is cleared
- **Production Time Calculation**:
  - Production time display only shown when both goods received and dispatch dates are set
  - Prevents calculation errors when goods haven't arrived yet
- **Testing**:
  - End-to-end test verified: Successfully creates jobs without goods received date
  - End-to-end test verified: Successfully edits and updates goods received date
  - Database migration completed successfully to make field nullable

#### Order Completion Button Redesign
- Converted job completion from checkbox to button interface for better UX and workflow enforcement
- **Button Behavior**:
  - "Mark Order as Completed" button only enabled when all line items are marked as completed
  - Changes to "Unmark as Completed" when order is already completed
  - Visual feedback: default variant when not completed, secondary variant when completed
- **Automatic State Management**:
  - Added useEffect guard that automatically resets order completion to false when any line item becomes incomplete
  - Prevents submission of "completed" jobs with incomplete line items
  - Clears completion metadata (completedById, completedOnTime) when auto-resetting
- **Completion Metadata**:
  - Automatically sets completedById to current user when marking order as complete
  - Properly clears metadata when unmarking
  - Maintains existing celebration/star logic when job is submitted as completed
- **UI Improvements**:
  - Helper text with Info icon displays when line items are not all completed
  - Button positioned at bottom right with other action buttons
  - Hidden input ensures completed field is properly registered for form submission
- Applied consistently to both JobFormDialog (new orders) and JobEditDialog (existing orders)

#### Line Item Completion Tracking - Persistence & Data Flow Fix
- Fixed critical issue where line item completion data (completedById and completedAt) was not being persisted or loaded correctly
- **Backend Enhancements**:
  - Updated `updateJobLineItem()` in storage layer to handle date conversion for `completedAt` field (similar to create operation)
  - Ensures consistent date handling on both create and update operations
- **Frontend Query Updates**:
  - Updated JobEditDialog query type to properly include `completedById`, `completedAt`, and `jobType` fields
  - Removed unsafe type casts (`as any`) that masked missing field data
- **Frontend Persistence**:
  - Both JobFormDialog and JobEditDialog now send `completedById` and `completedAt` in POST/PATCH requests
  - Updated `updateLineItem()` function signature to accept `null` values for completion fields
- **Result**: Complete end-to-end data flow now working - completion tracking data persists through API/storage to database and correctly rehydrates in UI
- **Technical Details**: Storage layer converts string dates to Date objects transparently; frontend sends ISO string dates or null values; Zod schemas validate the data flow