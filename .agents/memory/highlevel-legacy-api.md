---
name: HighLevel legacy API
description: Constraints of the HighLevel credential used for contact tags and campaign audiences.
---

Use the configured HighLevel credential with the legacy `rest.gohighlevel.com/v1` tag and contact endpoints. Do not move these reads to LeadConnector v3 unless the credential is deliberately replaced.

**Why:** The location key is accepted by v1 but rejected by the location-scoped v3 API as an invalid JWT. Contact lists can span multiple pages, and silently stopping early creates an unsafe partial audience.

**How to apply:** Follow `meta.nextPageUrl` until it is absent, detect repeating pagination links, fail visibly rather than truncate, and filter email DND/suppression flags before using contacts as recipients.