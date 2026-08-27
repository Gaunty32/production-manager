---
name: HighLevel legacy API
description: Constraints of the HighLevel credential used for contact tags and campaign audiences.
---

Use the configured HighLevel credential with the legacy `rest.gohighlevel.com/v1` tag and contact endpoints. Do not move these reads to LeadConnector v3 unless the credential is deliberately replaced.

**Why:** The location key is accepted by v1 but rejected by the location-scoped v3 API as an invalid JWT. Contact lists can span multiple pages, and silently stopping early creates an unsafe partial audience. The legacy API may return an `http://rest.gohighlevel.com` next-page link even when the initial request is HTTPS.

**How to apply:** Follow `meta.nextPageUrl` until it is absent, validate that each link stays on the legacy v1 host/path, upgrade its protocol to HTTPS, detect repeats, fail visibly rather than truncate, and filter email DND/suppression flags before using contacts as recipients.