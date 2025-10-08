# Production Management App

## Overview

This is a production management system for tracking customer orders, machine scheduling, and dispatch deadlines. The application helps manage manufacturing workflows by tracking jobs across multiple machines, monitoring deadlines, and ensuring timely completion of customer orders.

## User Preferences

Preferred communication style: Simple, everyday language.

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

**API Structure:**
- `/api/customers` - Customer CRUD operations
- `/api/jobs` - Job management with optional machine filtering
- Request/response validation using Zod schemas
- Centralized error handling middleware

### Data Storage

**Database:**
- PostgreSQL via Neon serverless database
- Drizzle ORM for type-safe database operations
- WebSocket connections for serverless Postgres

**Schema Design:**
- `customers` table: Stores customer information with UUID primary keys
- `jobs` table: Tracks production jobs with relationships to customers and machines
- Foreign key constraints ensuring referential integrity
- Boolean flags for tracking logo approval and on-time completion status

**Data Access Layer:**
- Repository pattern implemented through `IStorage` interface
- `DatabaseStorage` class provides concrete implementation
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