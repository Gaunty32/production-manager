---
name: HighLevel callback integration
description: Reliability and credential constraints for the public instant-callback automation.
---

Use direct LeadConnector contact upsert followed by workflow enrollment for instant callbacks. A successful generic webhook response does not prove that HighLevel created a contact or started the workflow.

**Why:** The previous webhook returned HTTP 200 while the intended HighLevel automation did not run. Direct API responses make each step independently verifiable and auditable.

**How to apply:** Keep the private integration token, location ID, and workflow ID from the same HighLevel sub-account. Verify read access to both workflows and contacts before trusting a new credential set, and never report callback success when either write step fails.