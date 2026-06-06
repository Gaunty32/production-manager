---
name: DB transactions & row locks
description: This Neon-backed Drizzle setup DOES support transactions and SELECT ... FOR UPDATE; use them for any claim/merge style concurrency.
---

This project's `db` (server/db.ts) is a websocket `Pool` + `drizzle({ client: pool })`, NOT the Neon HTTP driver. That means `db.transaction(async (tx) => ...)` and row-level locking via `.for("update")` both work.

**Why:** The Neon *HTTP* driver silently can't do multi-statement transactions; people assume that applies here. It doesn't — the websocket Pool supports full transactional semantics, and existing storage code already uses `db.transaction`.

**How to apply:** For any "read-check-then-write" race (claiming a shared resource, splitting/merging rows, enforcing a count limit under concurrency), do the whole read+check+write inside one `db.transaction`, lock the contended rows with `.for("update")`, and make destructive updates conditional (e.g. `WHERE id=? AND status='available'`) then check the returned row count. The casual-staff shift claim/merge (server/storage.ts `claimShiftAtomic`, `mergeAvailableShiftsAtomic`) is the reference pattern.
