---
name: Staff credit attribution
description: Which table is the source of truth for per-staff production credit and how to avoid double counting
---

**Rule:** `production_entries` is the source of truth for per-staff credit (quantity, minutes, stitches). Fall back to a line item's `completedById` ONLY when that line item has zero production entries all-time. Never sum both for the same item.

**Why:** Line items can be completed by multiple team members (a "team split" creates one production entry per contributor), and partial production may be recorded before completion. Counting both entries and the completer would double credit.

**How to apply:**
- Any new report/leaderboard crediting staff must check for existing entries per line item before using `completedById`.
- The PATCH line-item route guards this: re-completing an already-completed item with contributors is rejected (400), contributor quantities are validated against *remaining* quantity (item quantity minus existing entries), and entry-creation failure rolls back the completion fields.
- On a team split, the server derives `completedById` = largest-quantity contributor and `actualProductionTimeMinutes` = sum of contributor minutes.
