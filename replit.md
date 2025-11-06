## Overview

This application is a production management system for manufacturing, offering both staff and customer portals. Its core purpose is to track customer orders, schedule machines, and manage dispatch deadlines. Key capabilities include multi-line item job tracking, a robust scheduling system integrating machine and staff availability, and detailed production metrics. The system aims to streamline operations, improve efficiency, enhance customer satisfaction, and provide operational transparency.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The application follows Material Design principles with a minimalist aesthetic, supporting light/dark modes. Jobs are visually differentiated by customer via pastel colors, with overdue and "due today" jobs highlighted. The dashboard displays "Runs," "Time/Run," and "Total Time" for jobs, alongside an interactive timeline for scheduling with conflict detection. Extensive tooltips provide job notes and line item breakdowns. The UI is mobile-responsive, utilizing different layouts for mobile and desktop, including a horizontally scrolling production queue on smaller screens.

The dashboard features a card-based "scorecard" displaying KPIs like "Overdue Orders," "Logo Set-Ups Pending," and "Jobs Due in 3 Days," which act as clickable filters. The main "Production Queue" displays all non-completed jobs, with **one row per line item** to accommodate varying machine assignments. Line items are visually grouped by job, sharing customer color coding and urgency indicators. A collapsible "Completed Orders" section shows invoiced jobs. Date calculations use `startOfDay` and `endOfDay` for accuracy.

### Technical Implementations

The frontend is built with React, TypeScript, Vite, `shadcn/ui`, and Tailwind CSS. TanStack React Query manages server state, while React Hook Form with Zod handles form validation. The backend uses Express.js with Node.js and TypeScript, following a RESTful API design. Authentication is email/password-based with bcrypt and session management for both staff and customer portals, including session regeneration and rate limiting for staff. Data is stored in a PostgreSQL database (Neon) using Drizzle ORM. Request/response validation uses Zod schemas.

### Feature Specifications

The system supports multi-line item jobs with independent machine assignment, quantity, stitch count, and logo approval. Line items can be created with quantity 0 for pending orders and are immutable post-creation. A "quacking duck" validation alerts staff when quantity exceeds stitch count on line items (applies to Embroidery and Other job types only; excludes Print, Bagging, and Initials/Name jobs). A scheduling system combines machine availability and staff shifts, offering per-line-item schedule suggestions. Customer pricing tables (e.g., 2025/2026) enable accurate quote generation, including flat-rate pricing for specific job types and tiered pricing based on quantity, stitch count, or size. High-volume orders require manual pricing.

A complete invoicing workflow moves completed jobs to a draft queue, groups them by customer, and consolidates them into batch invoices with automatic Xero API integration. Xero invoice line items are professionally formatted, and intelligent Xero contact matching prevents duplicates. Automated tiered shipping cost calculations are included, along with consolidated shipment functionality. A logo setup queue tracks customer logo approvals, automatically adding a £10 charge to invoices upon approval.

A gamification system tracks staff performance with a star system and a leaderboard, showing on-time/late completions and normalized stitches per head-hour. A "Daily Production" view provides detailed breakdowns per staff member. User management, accessible by `super_admin` roles, allows creation, editing, and deletion of staff accounts. Line item completion tracking allows any staff member to mark items as complete, recording the user and timestamp. Actual production time can be recorded during job completion for efficiency analysis.

The production queue uses traffic light indicators for logo approval and goods received status. Job types include Embroidery, Print, Bagging, and Other, each with specific pricing logic. The customer portal provides a read-only interface for customers to view their order status and line item details, with jobs sorted by dispatch date and filterable by status.

## External Dependencies

- **Database Service**: Neon Serverless PostgreSQL
- **ORM**: Drizzle ORM
- **UI Component Libraries**: `shadcn/ui`, Radix UI primitives, Embla Carousel, Lucide React
- **Date Utilities**: `date-fns`
- **Form Management & Validation**: React Hook Form, Zod, @hookform/resolvers
- **Styling**: Tailwind CSS, `class-variance-authority`, `clsx`, `tailwind-merge`
- **Build Tools**: Vite, esbuild
- **Authentication**: Email/password with bcrypt, Express sessions
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **External APIs**: Xero API