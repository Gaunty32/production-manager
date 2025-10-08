# Production Management App

## Overview

This is a production management system for tracking customer orders, machine scheduling, and dispatch deadlines. The application helps manage manufacturing workflows by tracking jobs across multiple machines, monitoring deadlines, and ensuring timely completion of customer orders.

**Recent Updates (Oct 8, 2025):**
- Implemented embroidery production metrics system with time calculations
- Added stitch count field to job tracking (required field)
- Machine specifications: Velocity (8 heads), others (6 heads each) @ 750 stitches/min
- Production calculations: runs, time per run, total time with 3-min changeover
- Implemented Replit Auth for user authentication (currently bypassed with guest access)
- Prepared Xero API integration structure for invoice creation
- Added Select Uniforms company logo to application header

## User Preferences

Preferred communication style: Simple, everyday language.

## Embroidery Production Metrics

The application calculates production time based on embroidery specifications:

**Machine Specifications:**
- **Velocity (Machine 1):** 8 heads - Best machine for high-volume orders
- **Momentum (Machine 2):** 6 heads - Second tier machine
- **Apex (Machine 3):** 6 heads - Second tier machine
- **Surge (Machine 4):** 6 heads - Third tier machine
- **Pinnacle (Machine 5):** 6 heads - Third tier machine
- All machines operate at 750 stitches per minute

**Production Calculations:**
- **Runs:** Number of production cycles = ceil(quantity / machine_heads)
  - Example: 50 garments on Velocity (8 heads) = 7 runs
- **Embroidery Time:** stitch_count / 750 stitches per minute
  - Example: 5000 stitches = 6.67 minutes embroidery time
- **Time Per Run:** embroidery_time + 3 minutes changeover
  - Example: 6.67 + 3 = 9.67 minutes per run
- **Total Time:** runs × time_per_run
  - Example: 7 runs × 9.67 = 67.69 minutes total

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
- `jobs` table: Tracks production jobs with relationships to customers and machines
- Foreign key constraints ensuring referential integrity
- Boolean flags for tracking logo approval and on-time completion status

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