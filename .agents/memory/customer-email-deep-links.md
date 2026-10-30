---
name: Email deep links
description: Authentication, destination preservation and compatibility for customer and staff notification links.
---

Protected customer portal routes must confirm the customer session before mounting pages that issue authenticated API requests. If the session is missing, send the customer to login with the full customer path and query string as the return destination.

**Why:** Email apps commonly open links in a fresh embedded browser without the customer's existing portal cookie. Mounting the destination first can trigger several unauthorized requests and a global crash screen instead of a usable login flow.

**How to apply:** Include a stable conversation or record identifier in notification links where possible. After login, restore that destination and select the referenced item once without repeatedly forcing selection during later refreshes.

Staff email job links must also retain their destination through password and one-time-code sign-in. Keep old emailed URLs working when correcting notification destinations.

**Why:** Delivered emails cannot be rewritten. Correcting only newly generated links leaves existing messages broken, and sending staff to the dashboard after sign-in loses the context of the email.

**How to apply:** Use the actual staff job route for new notifications, retain redirects for old emailed paths, and test both signed-in navigation and fresh-browser sign-in.