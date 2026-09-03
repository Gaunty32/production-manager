---
name: Secret status checks
description: How to verify project secrets when Replit secret metadata and the running environment disagree.
---

The environment-variable metadata callback can report a configured secret as absent even when the running workspace and workflow receive it. When the UI shows a secret exists but metadata disagrees, verify only its presence in the workspace shell (for example, a non-empty check that prints yes/no) and never print its value.

**Why:** Stripe keys visible in Replit Secrets were reported as absent across shared, development, and production metadata, while the running development shell correctly had both keys.

**How to apply:** Treat the environment used by the actual workflow as authoritative for runtime availability. Restart the workflow after secret changes, then check startup behavior without exposing secret contents.