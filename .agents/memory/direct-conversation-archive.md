---
name: Direct conversation "disappearing channels"
description: Direct (non-job) chat channels use ONE shared status field; customer archive/delete hides them from staff, and staff inbox only shows status==open with no archived view.
---

Direct conversations (the `conversations` table, staff↔customer "channels" / General Chat) have a single shared `status` column: `open | archived | deleted`. There is NO per-side archive flag for them.

Contrast: **job** conversations use two separate booleans on the `jobs` table (`conversationArchivedByCustomer` / `conversationArchivedByStaff`), so each side hides independently.

**The disappearing-channels bug:**
- Customer-side `PUT /api/customer-portal/direct-conversations/:id/archive` sets the *shared* `status: "archived"`; DELETE sets `status: "deleted"`.
- The staff Messages page (`StaffMessages.tsx`) only renders `directConversations.filter(c => c.status === "open")` and has **no archived/restore view** for direct conversations.
- Net effect: when a customer archives/deletes their copy (or anything flips the shared status), the channel instantly vanishes from the staff inbox with no way to recover it. Staff perceive this as "our chat disappeared" and recreate the channel.

**Why it matters:** In production, the vast majority of direct channels end up `archived`, so almost all historical staff↔customer chats are invisible in the staff UI even though the rows still exist in the DB. Nothing is actually deleted — it's a visibility problem.

**How to apply / fix options:** (a) give staff an Archived section + unarchive for direct conversations, and/or (b) move direct conversations to per-side archive flags like job conversations so one side archiving never hides the other side's view.

**FIXED (option b, partial):** Added `conversations.archivedByStaff` boolean (default false). The shared `status` column now governs ONLY the customer's view; staff visibility is governed solely by `archivedByStaff`. Staff list/unread/auto-select all filter on `!archivedByStaff`; staff archive PATCHes `{archivedByStaff:true}`. Customer archive/delete still set `status` but no longer hide channels from staff. Side effect: all previously customer-archived/deleted channels reappeared for staff (archivedByStaff defaults false) — intended recovery. STILL MISSING: no staff-side unarchive UI for direct conversations (staff archive is currently one-way).
