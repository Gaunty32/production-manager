---
name: Staff active flag
description: Rules for the staff.active disable flag — where filtering must happen when adding new staff pickers or scheduling logic
---

**Rule:** `staff.active` (boolean, default true) marks leavers. Any NEW staff assignment picker (client Select) or server-side scheduling/candidate logic MUST filter `s.active !== false`. Historical displays (reports, leaderboards, name lookups by id) must NOT filter — leavers' names still render.

**Why:** Deleting staff permanently wipes production_entries and nulls completedById (history loss), so leavers are disabled instead. If a new picker forgets the filter, leavers become assignable again; if a historical view filters, leavers show as "Unknown".

**How to apply:**
- Client pickers: `staff.filter(s => s.active !== false)`; in EDIT dialogs also include the currently-assigned inactive person with a "(disabled)" label so the selected value isn't hidden.
- Server: auto-scheduling and machine-suggestion candidate lists filter active; GET /api/staff intentionally returns ALL staff (with the flag) so name lookups keep working.
- Toggling `active` via PATCH /api/staff/:id is super_admin-only (403 otherwise).
