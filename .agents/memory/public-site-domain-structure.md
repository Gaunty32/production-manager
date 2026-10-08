---
name: Public website domain structure
description: Agreed separation between the public marketing website and the production application.
---

Use `www.selectbranding.co.uk` as the home of the public marketing website. Keep `production.selectbranding.co.uk` as the production-management application, with the focused contract-embroidery campaign landing page remaining at `/demo-access`.

**Why:** The broader website needs room for services, educational content and customer acquisition without moving or disrupting the established app and campaign URL.

**How to apply:** Build public marketing pages on anonymous routes, preserve `/demo-access`, and do not repoint or replace the production subdomain when connecting the `www` custom domain. Acquisition and demo-access email CTAs must use the `www` origin; keep operational staff/customer links on `production`.

The trade-embroidery landing page at `go.selectbranding.co.uk/trade-embroidery` is built in HighLevel.

**Why:** The user identified this as a separate landing page where they want to reuse the existing callback automation.

**How to apply:** Supply standalone HTML/JavaScript rather than React for this page, and account for browser cross-origin permissions when calling the production app.