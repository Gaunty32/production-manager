---
name: Job pricing parity (staff vs customer portal)
description: Why awaiting-payment amounts showed £0.00 + POA, and how pricing is now resolved server-side.
---

- `customers.pricing_table_2025/2026` are BOOLEAN flags (which price list the customer is on), not JSON tables. `IS NOT NULL` checks are meaningless on them — check the boolean value.
- The staff Dashboard "Awaiting Payment" amount was originally computed client-side by looking the customer up in a separately fetched `/api/customers` list; when that lookup failed in the browser the row showed "Unknown" + "£0.00 + POA" even though data/pricing were fine (job Tempcare #1615 incident, Jul 2026).
- **Fix/decision:** `/api/jobs` now returns server-computed `amountDue`, `amountDuePoa`, and `customerName` per job (same `calculateJobPrice` path as the customer portal); the Dashboard prefers these over any client-side calculation.
- **Why:** server-side pricing can't race with client cache state and guarantees staff see the same figure the customer sees.
- **How to apply:** any new staff surface showing a job price should read the server fields from `/api/jobs`, not recompute in the browser. Known residual divergence: portal prices missing-stitch-count items at 0 while staff marks POA (follow-up task exists to unify).

- **Rule:** effective-date price changes must be applied inside the shared pricing functions, not only added to price-list displays.
- **Why:** the 1 September 2026 £0.20 increase appeared correctly in marketing and pricing tables while invoice previews and created invoices still used the base rates.
- **How to apply:** pass the calculation date through shared pricing helpers and verify one known example against the external calculations sheet before release.

- **Rule:** within one job, production lines with the same job type and exact stitch count/print-size code are priced as one logo quantity and merged into one invoice line.
- **Why:** the same logo can be produced as separate operations for different positions or machines, but quantity-band pricing is based on total applications of that logo.
- **How to apply:** keep production rows separate; aggregate only pricing and invoice output. If staff enter different manual unit prices, keep those invoice lines separate.
