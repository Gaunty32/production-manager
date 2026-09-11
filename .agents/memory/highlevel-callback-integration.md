---
name: HighLevel callback integration
description: Reliability and credential constraints for the public instant-callback automation.
---

Use direct LeadConnector contact upsert followed by workflow enrollment for instant callbacks. A successful generic webhook response does not prove that HighLevel created a contact or started the workflow.

**Why:** The previous webhook returned HTTP 200 while the intended HighLevel automation did not run. Direct API responses make each step independently verifiable and auditable.

**How to apply:** Keep the private integration token, location ID, and workflow ID from the same HighLevel sub-account. Verify read access to both workflows and contacts before trusting a new credential set, and never report callback success when either write step fails. For an immediate callback, omit the optional workflow `eventStartTime`; HighLevel's parser rejected JavaScript ISO timestamps even after replacing `Z` with a numeric offset.

Bulk customer contact syncs use all customer companies (active and inactive) plus active customer-portal users, deduplicate by normalized email (then phone), and add tags through the dedicated contact-tags endpoint after upsert.

**Why:** Customer companies and portal users often represent the same person, and sending tags in an upsert risks changing unrelated contact tags.

**How to apply:** Keep bulk sync super-admin initiated, preserve existing tags, normalize stored phones to E.164 (omit invalid phones when email is usable), retry rate-limit/server responses, and report grouped provider errors rather than treating a partial run as successful.