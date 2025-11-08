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

A complete invoicing workflow moves completed jobs to a draft queue, groups them by customer (sorted alphabetically), and consolidates them into batch invoices with automatic Xero API integration. Invoice dates are calculated as the next Friday (7th, 14th, 21st, or 28th of the month) after the job completion date. For example, jobs completed between the 1st-7th are invoiced on the 7th, jobs completed 8th-14th are invoiced on the 14th, etc. Due dates are automatically set to the 5th of the month following the invoice date. Xero invoice line items are professionally formatted, and intelligent Xero contact matching prevents duplicates. Automated tiered shipping cost calculations are included, along with consolidated shipment functionality. A logo setup queue tracks customer logo approvals, automatically adding a £10 charge to invoices upon approval.

A gamification system tracks staff performance with a star system and a leaderboard, showing on-time/late completions and normalized stitches per head-hour. A "Daily Production" view provides detailed breakdowns per staff member. User management, accessible by `super_admin` roles, allows creation, editing, and deletion of staff accounts. Line item completion tracking allows any staff member to mark items as complete, recording the user and timestamp. Actual production time can be recorded during job completion for efficiency analysis.

The production queue uses traffic light indicators for logo approval and goods received status. Job types include Embroidery, Print, Bagging, and Other, each with specific pricing logic. The customer portal provides a read-only interface for customers to view their order status and line item details, with jobs sorted by dispatch date and filterable by status.

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
- **External APIs**: Xero API

## Configuration & Deployment

### Xero OAuth Integration

The application integrates with Xero for automated invoice creation. To configure Xero OAuth:

1. **Xero Developer Portal Setup**:
   - Create an OAuth 2.0 app in the Xero Developer Portal (https://developer.xero.com/)
   - Configure the following redirect URIs in your Xero app:
     - **Development**: `https://[your-dev-domain].replit.dev/api/xero/auth/callback`
     - **Production**: `https://[your-deployment-url].replit.app/api/xero/auth/callback`
   - Example production URL: `https://selectuniforms-productionplanning.replit.app/api/xero/auth/callback`
   - Both URIs must be registered for OAuth to work in both environments

2. **Environment Variables**:
   - `XERO_CLIENT_ID`: Your Xero OAuth app client ID
   - `XERO_CLIENT_SECRET`: Your Xero OAuth app client secret
   - These must be set in both development and production environments

3. **Environment Detection**:
   - The app automatically detects whether it's running in production (`REPLIT_DEPLOYMENT=1`) or development
   - In production: Uses the production domain from request headers for OAuth callbacks
   - In development: Uses `REPLIT_DEV_DOMAIN` for OAuth callbacks
   - This ensures the correct redirect URI is used for Xero OAuth flows

4. **Testing the Connection**:
   - Navigate to the Draft Invoicing Queue page
   - Click "Connect to Xero" button
   - Authorize the connection in Xero
   - You should be redirected back with a success message

**Important**: If Xero connection fails, verify that:
- Both redirect URIs (dev and prod) are registered in your Xero app
- The redirect URIs match exactly (including protocol, domain, and path)
- Environment variables are set correctly in both environments

### Customer Portal Security

New customer portal features (as of recent updates):
- **Forced Password Reset**: New customer logins must reset their password on first login
- **Access Control**: Staff can enable/disable customer portal access via toggle switch
- Database fields: `customer_users.must_reset_password` and `customer_users.active`

## Customer Job Upload System (New Feature - Backend Complete)

### Overview
Customers can now submit new job requests through their portal. Jobs enter a holding area for staff review before moving to production.

### Job Lifecycle
1. **Customer Submission** (`pending_customer_approval`):
   - Customer fills out job details: name, quantity, PO number, notes, delivery address, dispatch date
   - Customer uploads files (images, PDFs, etc.) - stored in Replit Object Storage with ACL
   - Customer can chat with staff about the job

2. **Staff Review**:
   - Staff view all pending submissions in holding area
   - Staff can approve (moves to `production` status) or reject (with reason)
   - Staff can respond to customer via chat

3. **Production** (`production`):
   - Approved jobs enter the normal production queue
   - Staff assign machines, create line items, schedule production

### API Endpoints

**Customer Portal Routes:**
- `GET /api/customer-portal/jobs` - Get production/completed jobs
- `GET /api/customer-portal/jobs/pending` - Get jobs awaiting approval
- `POST /api/customer-portal/jobs` - Submit new job request
- `POST /api/customer-portal/objects/upload` - Get presigned URL for file upload
- `POST /api/customer-portal/jobs/:jobId/files` - Attach file to job
- `POST /api/customer-portal/jobs/:jobId/messages` - Send message
- `GET /api/customer-portal/jobs/:jobId/messages` - Get messages

**Staff Routes:**
- `GET /api/staff/jobs/pending` - Get all pending customer submissions
- `POST /api/staff/jobs/:jobId/approve` - Approve job
- `POST /api/staff/jobs/:jobId/reject` - Reject job with reason

### Database Schema Updates
- **jobs table**: Added `submittedById`, `submittedAt`, `approvedById`, `approvedAt`, `rejectedById`, `rejectedAt`, `rejectionReason`
- **Status field**: Now supports `pending_customer_approval`, `production`, `rejected`, `completed`
- **jobFiles table**: Stores uploaded files with ACL policies
- **jobMessages table**: Stores chat messages between customers and staff

### Security
- File ACL: Files are private and accessible only to customer company members and staff
- Customer validation: Customers can only access/submit jobs for their company
- Staff authentication required for approval/rejection

### Frontend Status
**Backend**: ✅ Complete and tested  
**Frontend**: ✅ Complete and ready for testing

**Completed Components:**
- Customer: Job submission form with file upload (CustomerSubmitJob.tsx)
- Customer: Pending jobs view (CustomerPendingJobs.tsx)
- Customer: Job detail page with real-time chat polling (CustomerJobDetail.tsx)
- Staff: Holding Area dashboard (StaffHoldingArea.tsx)
- Staff: Approval/rejection workflow with dialogs

**Key Features:**
- Real-time chat polling (3-second intervals) for instant message updates
- File upload using Uppy with Replit Object Storage integration
- Form validation with React Hook Form + Zod
- TanStack Query for optimistic cache updates
- All interactive elements have data-testid attributes for e2e testing

**Known Issues:**
- Uppy CSS temporarily disabled (file upload works but modal styling is basic)
- TODO: Add Uppy CSS via CDN or fix Vite configuration