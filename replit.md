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