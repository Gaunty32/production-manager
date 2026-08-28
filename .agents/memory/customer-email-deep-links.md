---
name: Customer email deep links
description: Authentication and destination-preservation rules for links from customer notification emails.
---

Protected customer portal routes must confirm the customer session before mounting pages that issue authenticated API requests. If the session is missing, send the customer to login with the full customer path and query string as the return destination.

**Why:** Email apps commonly open links in a fresh embedded browser without the customer's existing portal cookie. Mounting the destination first can trigger several unauthorized requests and a global crash screen instead of a usable login flow.

**How to apply:** Include a stable conversation or record identifier in notification links where possible. After login, restore that destination and select the referenced item once without repeatedly forcing selection during later refreshes.