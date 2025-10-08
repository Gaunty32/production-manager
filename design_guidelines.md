# Production Management App - Design Guidelines

## Design Approach: Design System Foundation with Modern Productivity Aesthetics

**Selected Approach:** Material Design System with Linear-inspired minimalism
**Rationale:** Production management tools require data clarity, workflow efficiency, and team collaboration. Material Design provides robust patterns for tables, forms, and data visualization, while Linear's aesthetic brings modern, clean visual hierarchy perfect for daily operational use.

**Core Design Principles:**
1. Information clarity over visual flourish
2. Efficient task completion with minimal cognitive load
3. Scannable data presentation for quick decision-making
4. Consistent, predictable interaction patterns

---

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary: 239 84% 67% (Modern blue for actions, CTAs)
- Background: 0 0% 98% (Soft white)
- Surface: 0 0% 100% (Pure white cards/panels)
- Text Primary: 222 47% 11% (Near black)
- Text Secondary: 215 16% 47% (Muted gray)
- Border: 214 32% 91% (Subtle borders)
- Success: 142 71% 45% (On-time completion)
- Warning: 38 92% 50% (Approaching deadlines)
- Error: 0 84% 60% (Overdue items)

**Dark Mode:**
- Primary: 217 91% 60% (Softer blue)
- Background: 222 47% 11% (Deep charcoal)
- Surface: 217 33% 17% (Elevated panels)
- Text Primary: 210 40% 98% (Off-white)
- Text Secondary: 215 20% 65% (Light gray)
- Border: 217 33% 24% (Subtle dark borders)

### B. Typography

**Font Families:**
- Primary: Inter (via Google Fonts CDN) - All UI text
- Monospace: 'Roboto Mono' - PO numbers, dates, quantities

**Hierarchy:**
- Page Titles: text-2xl font-semibold (Inter)
- Section Headers: text-lg font-medium
- Body Text: text-sm font-normal
- Labels: text-xs font-medium uppercase tracking-wide
- Data Values: text-sm font-medium (monospace for numbers)
- Buttons: text-sm font-medium

### C. Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, and 12 consistently
- Component padding: p-4 or p-6
- Section spacing: mb-6 or mb-8
- Grid gaps: gap-4 or gap-6
- Form field spacing: space-y-4

**Container Strategy:**
- Main content: max-w-7xl mx-auto px-4
- Modal dialogs: max-w-2xl
- Form containers: max-w-4xl

### D. Component Library

**Navigation:**
- Top navbar: Fixed header with company branding, global search, user profile
- Sidebar navigation: Collapsible left panel with sections: Dashboard, All Orders, By Machine (5 sub-items), Customers, Reports
- Active state: bg-primary/10 with left border accent

**Data Display:**
- **Production Queue Table:**
  - Sticky header row with sortable columns
  - Alternating row colors (subtle zebra striping)
  - Status badges: Logo Approved, On-time Completion (rounded-full px-3 py-1)
  - Machine assignment chips with distinct colors per machine
  - Row actions: Edit, Complete, Delete (icon buttons on hover)
  - Compact spacing: py-3 px-4 per cell

- **Machine Views:**
  - Kanban-style columns (one per machine)
  - Draggable job cards with key info
  - Card design: rounded-lg shadow-sm p-4 space-y-2

- **Dashboard Cards:**
  - Metric cards: Orders in progress, Overdue, Completed today
  - Chart visualizations: On-time completion rate, Machine utilization
  - Card style: rounded-xl border bg-surface p-6

**Forms:**
- **Add/Edit Order Modal:**
  - Full-width overlay with centered modal (max-w-2xl)
  - Form layout: Two-column grid on desktop, single on mobile
  - Input styling: rounded-md border focus:border-primary focus:ring-2 focus:ring-primary/20
  - Dropdowns: Custom select with search for customers, simple select for Yes/No
  - Date pickers: Calendar widget with clear visual feedback
  - Action buttons: Primary (Submit), Secondary (Cancel) - right aligned

- **Quick Add Form:**
  - Inline form at top of queue (collapsed by default)
  - Expands with smooth transition
  - Essential fields only for rapid entry

**Buttons:**
- Primary: bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90
- Secondary: border border-border rounded-md px-4 py-2 hover:bg-surface
- Danger: bg-error text-white (for deletions)
- Icon buttons: p-2 rounded-md hover:bg-surface

**Status Indicators:**
- Logo Approved: Green checkmark badge or red X badge
- On-time: Green "Yes" / Red "No" badges
- Priority: Border-left accent on overdue items (border-l-4 border-error)

### E. Interaction Patterns

**Sorting & Filtering:**
- Click column headers to sort (ascending/descending arrows)
- Filter panel slides from right: Customer multi-select, Machine checkboxes, Date range picker
- Applied filters shown as dismissible chips below toolbar

**Inline Editing:**
- Double-click table cells for quick edits (where appropriate)
- Tab navigation between editable fields
- Auto-save with subtle success notification

**Drag & Drop:**
- Drag jobs between machine columns
- Visual drop zones with dashed borders
- Ghost image during drag

**Notifications:**
- Toast messages: Top-right corner, auto-dismiss in 3s
- Success: Green, Warning: Amber, Error: Red
- No animations on appearance/dismissal (immediate)

### F. Responsive Behavior

**Desktop (lg+):** 
- Sidebar visible, table shows all columns
- Two-column forms

**Tablet (md):**
- Collapsible sidebar with hamburger menu
- Table scrolls horizontally
- Single-column forms

**Mobile:**
- Bottom navigation tabs
- Card-based job list (no table)
- Full-screen modals

---

## Visual Hierarchy & Data Presentation

**Primary Focus:** Production queue ordered by required dispatch date (earliest first)
**Visual Priority Indicators:**
1. Overdue items: Red left border, slightly elevated (shadow-md)
2. Due today: Amber background tint
3. Upcoming: Standard styling

**Machine Assignment:**
- Machine 1: bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300
- Machine 2: bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300
- Machine 3: bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300
- Machine 4: bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300
- Machine 5: bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300

**Data Density:** Compact but scannable - 40-50 rows visible on standard screen

---

## Images & Assets

**Icons:** Heroicons (CDN) - solid for filled states, outline for default
- Dashboard: ChartBarIcon
- Orders: ClipboardDocumentListIcon
- Machines: CogIcon
- Add: PlusIcon
- Edit: PencilIcon
- Delete: TrashIcon
- Filter: FunnelIcon
- Search: MagnifyingGlassIcon

**No Hero Images:** This is a utility application - focus on immediate data visibility, not marketing imagery

**Logo/Branding:** Company logo in top-left navbar (max-h-8)

---

This design creates a professional, efficient production management tool that prioritizes workflow clarity and team productivity over decorative elements.