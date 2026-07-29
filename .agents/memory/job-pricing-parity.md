---
name: Job pricing parity (staff vs customer portal)
description: Why awaiting-payment amounts showed £0.00 + POA, and how pricing is now resolved server-side.
---

- `customers.pricing_table_2025/2026` are BOOLEAN flags (which price list the customer is on), not JSON tables. `IS NOT NULL` checks are meaningless on them — check the boolean value.
- The staff Dashboard "Awaiting Payment" amount was originally computed client-side by looking the customer up in a separately fetched `/api/customers` list; when that lookup failed in the browser the row showed "Unknown" + "£0.00 + POA" even though data/pricing were fine (job Tempcare #1615 incident, Jul 2026).
- **Fix/decision:** `/api/jobs` now returns server-computed `amountDue`, `amountDuePoa`, and `customerName` per job (same `calculateJobPrice` path as the customer portal); the Dashboard prefers these over any client-side calculation.
- **Why:** server-side pricing can't race with client cache state and guarantees staff see the same figure the customer sees.
- **How to apply:** any new staff surface showing a job price should read the server fields from `/api/jobs`, not recompute in the browser. Known residual divergence: portal prices missing-stitch-count items at 0 while staff marks POA (follow-up task exists to unify).
