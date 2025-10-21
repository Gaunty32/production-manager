## Overview

This application is a production management system designed to track customer orders, schedule machines, and manage dispatch deadlines within a manufacturing workflow. It aims to streamline manufacturing operations, improve efficiency, and enhance customer order fulfillment by providing a comprehensive overview of the production process. Key capabilities include multi-line item job tracking with per-item specifics, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The project envisions enhancing customer satisfaction and operational transparency in manufacturing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The application adheres to Material Design principles with a minimalist aesthetic, supporting light/dark modes. Jobs are visually differentiated by customer using unique light pastel colors, with overdue jobs prioritized (red) and "due today" jobs highlighted with an amber ring. The dashboard displays calculated "Runs," "Time/Run," and "Total Time" for jobs. An interactive timeline view facilitates machine and staff scheduling with conflict detection. Extensive tooltips provide job notes and line item breakdowns. Urgent orders are highlighted on the dashboard. All dialog components are accessible with `DialogDescription`, and interactive elements are keyboard-friendly. Role-based visibility ensures Admin and Manager roles can view pricing, while Staff cannot. Customer lists are card-based for better space utilization, especially for addresses, and visually indicate pricing tables (e.g., orange background for 2025 pricing). A multi-step job creation form guides users through the order entry process, allowing for optional date entry and displaying production time calculations with urgency warnings. Flat-rate job types like "Embroidery Initials/Name" and "Print Initials/Name" automatically adjust UI elements such as stitch count input and machine assignment fields.

The dashboard features three distinct sections: Production Queue (orders ready for production with all required information), Pending Orders (orders awaiting information such as dates or logo approvals, highlighted with amber background), and Completed Orders (invoiced jobs). Order summary in job creation now shows breakdown by job type (e.g., "Total Embroidery: 20") instead of generic totals. Pricing calculations skip line items with missing stitch counts to prevent incorrect pricing display.

### Technical Implementations

The frontend uses React with TypeScript, Vite, `shadcn/ui`, and Tailwind CSS. State management is handled by TanStack React Query for server state and React Hook Form with Zod for form validation. The backend is built with Express.js on Node.js, using TypeScript, following a RESTful API design. Authentication is managed via Replit Auth (OpenID Connect) with session-based authentication and Passport.js. Request/response validation uses Zod schemas. Data storage uses PostgreSQL (Neon serverless database) with Drizzle ORM.

### Feature Specifications

The system supports multi-line item jobs with quantity, stitch count, logo approval, individual completion tracking, and independent machine assignment. Line items are immutable post-creation. A robust scheduling system combines machine availability and staff shifts, preventing double-bookings, with simplified staff shift management using recurring days. Per-line-item schedule suggestions are available based on machine assignment. Customer pricing tables (2025/2026) enable accurate quote generation, including separate tables for print jobs based on size (A6, A5, A4, A3) and handling of flat-rate pricing for specific job types. High-volume orders (1000+ units or 50,000+ stitches) require manual price entry. Full CRUD operations are available for staff and customers. Production calculations derive runs, time per run, and total production time. PO numbers are optional, and job notes are supported.

A complete invoicing workflow moves completed jobs to a draft queue for review, groups them by customer, and consolidates them into batch invoices with automatic Xero API integration. Xero invoice line item descriptions are professionally formatted, and intelligent Xero contact matching uses multi-field lookup to prevent duplicate contacts. Xero item codes are automatically assigned based on job type: "EMB" for embroidery, "PRINT" for print jobs, "BAG" for bagging, "OTHER" for other job types, and "CARRIAGE" for shipping line items. Shipping information tracking includes methods (Customer Collection, Consolidated Back to Customer, Direct Delivery), DHL tracking numbers, package count, and package type (Boxes/Bags), with automated tiered shipping cost calculations. Consolidated shipment functionality allows multiple completed jobs to be shipped together, sharing tracking details and avoiding duplicate shipping costs. 

Logo setup queue management tracks customer logo approval requests with £10 charge per approved logo. The queue displays on the dashboard showing pending approvals with customer name, job name, notes, and creation date. Approved logo setups are automatically added as £10 line items to customer invoices (both single and consolidated) and are only deleted from the queue after successful invoice creation to prevent data loss. Logo setups use itemCode "OTHER" in Xero. The feature prevents revenue loss by ensuring logo setup charges are only removed after confirmation of successful invoice generation.

A gamification system tracks staff performance with a star system and a leaderboard. A `super_admin` role provides user management and role editing. The production queue displays traffic light indicators for logo approval and goods received status, with color-coded urgency for required dispatch dates. Job types include Embroidery, Print, Bagging, and Other, with pricing currently calculated for Embroidery and Print types. "Date Received" is now "Goods Received," and the system calculates and visually indicates production time, highlighting urgent orders. Job completion requires all line items to be completed first, with automatic status resets if line items become incomplete. The goods received date field is optional.

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
- **External APIs**: Xero API