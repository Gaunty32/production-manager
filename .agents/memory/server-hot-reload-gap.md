---
name: Server hot-reload gap
description: Backend edits may not auto-reload in dev; restart the workflow before testing new server behavior.
---

Edits to `server/routes.ts` (and other backend files) are not always picked up automatically by the running dev server.

**Why:** During the team part-completion work (July 2026), a newly added validation guard in `POST /api/production-entries` was tested via curl immediately after the edit and appeared to fail (old behavior ran, test data leaked through). After restarting the workflow, the same test passed.

**How to apply:** After editing backend code, restart the workflow before curl-testing the new behavior — otherwise you are testing stale code and may draw wrong conclusions or leave behind test data the old code allowed.
