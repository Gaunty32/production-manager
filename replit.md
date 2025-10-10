# Production Management App

## Overview

This is a production management system for tracking customer orders, machine scheduling, and dispatch deadlines. The application helps manage manufacturing workflows by tracking jobs across multiple machines, monitoring deadlines, and ensuring timely completion of customer orders.

**Recent Updates (Oct 10, 2025):**
- **Multiple Line Items per Job**: Full support for jobs with multiple quantities/sizes
  - **Database**: New job_line_items table with quantity and optional description fields (CASCADE delete)
  - **Job Creation**: JobFormDialog allows adding/removing multiple line items with inline validation
  - **Display**: Production queue shows total quantity with item count indicator (e.g., "45 (3 items)")
  - **Line Items Tooltip**: Hover over quantity to see breakdown with descriptions (keyboard accessible)
  - **Notes Indicator**: StickyNote icon next to job name shows notes in separate tooltip
  - **Accessibility**: Both tooltips are keyboard accessible with proper ARIA labels and focus rings
  - **API Enhancement**: GET /api/jobs includes lineItems array for each job
  - **Metrics Calculation**: Production metrics use summed quantity from all line items
  - **End-to-End Tested**: Comprehensive test coverage confirms all features working correctly

**Previous Updates (Oct 9, 2025):**
- **Complete Job Scheduling System**: Fully implemented scheduling system combining machine availability with staff working hours
  - **Backend**: Database tables (staff_shifts, machine_schedule_blocks, job_schedule) with comprehensive scheduling logic
  - **Scheduling Algorithm**: Intersects machine and staff availability, prevents double-booking, finds earliest available slots
  - **Conflict Detection**: Validates EITHER machine OR staff conflicts to prevent overlapping bookings
  - **Timeline View**: Interactive grid showing machines on Y-axis, time on X-axis with visual schedule blocks
  - **Staff Shift Management**: UI for creating/editing staff working hours with recurring weekly schedule support
  - **Machine Blocks**: Management interface for maintenance/downtime scheduling
  - **Job Allocation**: Dialog-based interface for scheduling jobs with drag-and-drop style interaction
  - **Smart Filtering**: Machine, staff, and status filters for timeline view
  - **Availability Summary**: Real-time panel showing machine utilization, staff shifts, and maintenance blocks
  - **Unscheduled Jobs**: Display of jobs awaiting schedule assignment
  - **Schedule Suggestions**: "Find Earliest Slot" feature in job forms automatically finds optimal scheduling
  - **API Routes**: Full CRUD operations for shifts, machine blocks, and job schedules with date range filtering
  - **End-to-End Tested**: Comprehensive test coverage confirming all features working correctly
- **Customer editing**: Full CRUD operations for customers including contact details (name, email, telephone, address)
  - Edit button on Customers page allows updating all customer information
  - CustomerFormDialog supports both create and edit modes
- **Staff editing**: Full CRUD operations for staff members
  - Edit button on Staff page allows updating staff member names
  - StaffFormDialog supports both create and edit modes
- **Urgent Orders Summary**: Added visual summary sections at top of dashboard highlighting time-sensitive orders
  - Overdue Orders section (red/destructive styling) shows ALL orders past dispatch date
  - Orders Due Today section (amber/yellow styling) shows ALL orders due for dispatch today
  - No limit on number of orders displayed (shows complete list)
  - Sections only appear when relevant orders exist (conditional rendering)
- **Compact table layout**: Reduced padding and optimized spacing in production queue for better screen fit
- **Sidebar navigation fix**: Always displays sidebar with menu toggle for all users (guest access enabled)
- **Staff management system**: Full CRUD operations for managing staff members who complete orders
  - Staff deletion automatically unassigns all jobs (sets completedById to NULL) before removing the staff member
  - Jobs remain in system and show "N/A" in Completed By column when unassigned
- **Completed By tracking**: Added dropdown field to job creation/editing for selecting which staff member completed the order
- **Staff display in production queue**: Added "Completed By" column showing staff member names (or "N/A" if unassigned)
- **Staff page**: Dedicated /staff route with alphabetically sorted staff list and management interface
- **Query optimization**: Standardized all queries to use default queryFn pattern for consistent error handling
- **Error message surfacing**: All mutations now display actual server error messages instead of generic fallback messages
- **Notes tooltip on hover**: Job notes now display in a tooltip when hovering over job rows in the production queue
- **PO Number optional**: PO number field is now optional and can be left empty when creating/editing jobs
- **Machine renaming**: Updated to real machine names - Barudan 8 (8 heads), Barudan, SWF, SWF (6 heads each)
- **Machine count reduced**: Removed Machine 5, now tracking 4 machines total
- Implemented embroidery production metrics system with time calculations
- Added stitch count field to job tracking (required field)
- Production calculations: runs, time per run, total time with 3-min changeover
- Implemented Replit Auth for user authentication (currently bypassed with guest access)
- Prepared Xero API integration structure for invoice creation
- Added Select Uniforms company logo to application header
- **Customer color coding**: Each customer's jobs display with unique light pastel colors for easy visual differentiation
- **Alphabetical sorting**: Customers automatically sorted by name in both Customers page and job form dropdown
- **Notes field**: Added optional notes textarea to job creation and editing for special instructions
- **Job editing**: Full edit functionality with JobEditDialog component and PATCH endpoint for updating jobs
- **Accessibility improvements**: Added DialogDescription to all dialog components for screen reader support

## User Preferences

Preferred communication style: Simple, everyday language.

## Customer Color Coding

The application uses a visual color coding system to help quickly identify which customer each job belongs to:

**Color System:**
- Each customer is automatically assigned a unique light pastel color
- Colors are generated using a hash function based on the customer ID, ensuring consistency
- 12 different color options available (blue, purple, pink, green, yellow, orange, teal, cyan, indigo, rose, emerald, amber)
- All colors work in both light and dark modes
- Color coding is displayed as a colored left border (4px) and light pastel background on job rows

**Visual Priority:**
When multiple visual indicators apply to a job, they are layered in this priority:
1. **Overdue jobs** (highest): Red border-left overrides customer colors
2. **Customer colors**: Pastel background + colored border-left
3. **Due today jobs** (lowest): Amber ring accent augments customer colors without replacing them

**Implementation:**
- Color utility functions in `shared/colors.ts`
- Applied automatically to all job rows in Dashboard and machine views
- Customer colors are preserved when jobs are due today (amber ring adds accent)

## Embroidery Production Metrics

The application calculates production time based on embroidery specifications:

**Machine Specifications:**
- **Barudan 8 (Machine 1):** 8 heads - Best machine for high-volume orders
- **Barudan (Machine 2):** 6 heads
- **SWF (Machine 3):** 6 heads
- **SWF (Machine 4):** 6 heads
- All machines operate at 750 stitches per minute

**Production Calculations:**
- **Runs:** Number of production cycles = ceil(quantity / machine_heads)
  - Example: 50 garments on Barudan 8 (8 heads) = 7 runs
- **Embroidery Time:** stitch_count / 750 stitches per minute
  - Example: 5000 stitches = 6.67 minutes embroidery time
- **Time Per Run:** embroidery_time + 3 minutes changeover, rounded UP to nearest minute
  - Example: 6.67 + 3 = 9.67 → rounds up to 10 minutes
- **Total Time:** runs × time_per_run, rounded UP to next 10 minutes
  - Example: 7 runs × 9.67 = 67.69 → rounds up to 70 minutes

**Implementation:**
- Calculation functions in `shared/machines.ts`
- Production metrics displayed in dashboard table (Runs, Time/Run, Total Time)
- Jobs without assigned machines show "-" for production metrics
- Form includes stitch count field with default value of 5000

## Xero Integration

The application is set up to integrate with Xero for invoice creation. To enable:

1. Set the following environment variables:
   - `XERO_CLIENT_ID`: Your Xero app client ID
   - `XERO_CLIENT_SECRET`: Your Xero app client secret  
   - `XERO_TENANT_ID`: Your Xero organization tenant ID
   - `XERO_ACCESS_TOKEN`: Your Xero API access token (or implement OAuth 2.0 flow)

2. **Getting an Access Token:**
   - Option A: Manually obtain a token from Xero OAuth 2.0 flow and set `XERO_ACCESS_TOKEN`
   - Option B: Implement OAuth 2.0 callback routes to automatically manage token refresh

3. Once configured, you can create invoices directly from completed jobs

4. Check integration status at `/api/xero/status`

**Note:** The current implementation expects a valid access token. For production use, implement the full OAuth 2.0 flow with token refresh handling.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React with TypeScript as the primary UI framework
- Vite as the build tool and development server
- Wouter for lightweight client-side routing

**UI Component System:**
- shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Design system following Material Design principles with Linear-inspired minimalism
- Theme support with light/dark mode toggle using React Context

**State Management:**
- TanStack React Query (v5) for server state management and caching
- React Hook Form with Zod for form validation
- Local state management using React hooks

**Key Design Decisions:**
- Component-based architecture with reusable UI elements (JobRow, MachineBadge, StatusBadge)
- Form handling using controlled components with schema validation
- Responsive design with mobile-first approach
- Accessibility-first with ARIA labels and semantic HTML

### Backend Architecture

**Server Framework:**
- Express.js running on Node.js
- TypeScript for type safety across the stack
- RESTful API design pattern

**Development Setup:**
- Vite middleware integration for HMR (Hot Module Replacement) in development
- Separate build pipeline for client (Vite) and server (esbuild)
- Environment-based configuration (development vs production)

**Authentication:**
- Replit Auth using OpenID Connect
- Session-based authentication with PostgreSQL session store
- Passport.js for authentication middleware
- JWT token refresh for extended sessions

**API Structure:**
- `/api/auth/user` - Get authenticated user
- `/api/login` - Initiate login flow
- `/api/logout` - End session and logout
- `/api/customers` - Customer CRUD operations (protected)
- `/api/jobs` - Job management with optional machine filtering (protected)
- `/api/staff` - Staff management CRUD operations (protected)
- `/api/xero/status` - Check Xero integration status (protected)
- `/api/xero/invoice/:jobId` - Create invoice in Xero (protected)
- Request/response validation using Zod schemas
- Protected routes require authentication via isAuthenticated middleware

### Data Storage

**Database:**
- PostgreSQL via Neon serverless database
- Drizzle ORM for type-safe database operations
- WebSocket connections for serverless Postgres

**Schema Design:**
- `sessions` table: Stores user sessions for authentication (Passport.js)
- `users` table: Stores user accounts with email, names, and profile images
- `customers` table: Stores customer information with UUID primary keys
- `staff` table: Stores staff member names with UUID primary keys
- `jobs` table: Tracks production jobs with relationships to customers, machines, and staff members
- Foreign key constraints ensuring referential integrity
- Boolean flags for tracking logo approval and on-time completion status
- Optional staff assignment to jobs via `completedById` field

**Data Access Layer:**
- Repository pattern implemented through `IStorage` interface
- `DatabaseStorage` class provides concrete implementation
- User management methods (upsertUser, getUser) for authentication
- Abstracted database operations for testability

### External Dependencies

**Database Service:**
- Neon Serverless PostgreSQL (@neondatabase/serverless)
- Connection pooling for efficient database access
- Drizzle Kit for schema migrations

**UI Component Libraries:**
- Radix UI primitives for accessible, unstyled components
- Embla Carousel for carousel functionality
- Lucide React for iconography
- date-fns for date manipulation

**Development Tools:**
- Replit-specific plugins for development environment integration
- Runtime error overlay for better debugging
- Cartographer and dev banner for Replit features

**Form & Validation:**
- React Hook Form for form state management
- Zod for runtime schema validation
- @hookform/resolvers for Zod integration

**Styling:**
- Tailwind CSS with custom configuration
- class-variance-authority for variant-based component styling
- clsx and tailwind-merge for conditional class application

**Key Architectural Patterns:**
- Monorepo structure with shared types between client and server
- Path aliases for clean imports (@/, @shared/, @assets/)
- Type-safe API contracts using shared Zod schemas
- Incremental TypeScript compilation for faster development builds