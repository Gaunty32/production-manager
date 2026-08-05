---
name: Google Drive/Sheets rate limits
description: Why all Google connector calls must go through the throttled googleApiJson helper
---
Google Sheets caps reads at ~10 requests/sec per user. The invoicing page renders many customer Drive-verification panels at once; each panel needs several Drive/Sheets calls, so uncontrolled parallel calls blow the cap and surface as "Sheets values error: Rate limit exceeded 14/10 RPS".

**Rule:** every Google connector call in the server goes through the shared throttled+retrying helper (queue with ~150ms spacing, auto-retry on 429/"rate limit" with backoff). The parent Contract-Embroidery folder listing is identical for all customers — it is cached (~5 min) so a page of panels costs one listing call.

**Why:** client-side 429 retries never fire — the proxy surfaces Google's rate error as a generic 500 with the message in the body, not a 429 status.

**How to apply:** any new Drive/Sheets feature must reuse the helper, never call connectors.proxy directly; check error in the JSON body, not just HTTP status.
