---
name: HighLevel legacy API
description: Constraints of the HighLevel credential used for contact tags and campaign audiences.
---

Use the configured HighLevel credential with the legacy `rest.gohighlevel.com/v1` tag and contact endpoints. Do not move these reads to LeadConnector v3 unless the credential is deliberately replaced.

**Why:** The location key is accepted by v1 but rejected by the location-scoped v3 API as an invalid JWT. Contact lists can span multiple pages, and silently stopping early creates an unsafe partial audience. The legacy API may return an `http://rest.gohighlevel.com` next-page link even when the initial request is HTTPS.

**How to apply:** Follow `meta.nextPageUrl` until it is absent, validate that each link stays on the legacy v1 host/path, upgrade its protocol to HTTPS, detect repeats, fail visibly rather than truncate, and filter email DND/suppression flags before using contacts as recipients.

The exhaustive contact scan can take around 30 seconds. Share one in-flight scan
between concurrent callers and keep the complete raw contact list in a short
in-memory cache, then apply the selected tag and suppression filters to that
snapshot.

**Why:** Re-fetching every legacy contact page for each preview made the button
appear broken; a measured repeat against the same snapshot returned in
milliseconds while preserving the same audience count.

**How to apply:** Warm the contact snapshot when the campaign tag picker loads,
reuse it for previews and scheduled audience resolution for a few minutes, and
never cache or reuse a truncated/failed scan.

For the weekly article campaign, the HighLevel-tag audience is a union of all
active portal users and matching HighLevel contacts. Deduplicate by normalized
email before applying campaign unsubscribe filtering.

**Why:** Portal users must not be omitted when the selected HighLevel tag is
narrower than the customer base, while overlapping records must not receive two
copies.

**How to apply:** Keep the union in the shared audience resolver so previews,
scheduled sends, and recipient persistence use identical counts and delivery
behavior. The existing-customer-only source remains selectable for portal-only
campaigns.