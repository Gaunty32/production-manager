---
name: Dev vs prod data divergence on publish
description: Why data changes made in the dev DB never appear in the published app, and how to actually fix live data.
---

Republishing only pushes CODE and SCHEMA to production — it never copies row data. The development database and the production database are entirely separate.

**Why this matters:** A common false fix is to delete/edit records in the dev DB to "clean up" something the user sees in the published app. After republish the user still sees the old data live, because the published app reads the prod DB which was never touched. This looks like "the change didn't work / why is it still there?".

**How to apply:**
- Agent tools can only READ prod (`executeSql` with `environment: "production"` is read-only). You cannot DELETE/UPDATE prod data from the agent.
- To fix live data, the change must go through the running published app's own UI/API (e.g. a staff/super-admin Delete button hitting `DELETE /api/jobs/:id`). So the durable fix for "stale records on live" is to make sure the app itself has a control the user can click on production — then have them use it on the live site.
- When diagnosing "I already removed this but it's still there", first compare the same query in `development` vs `production`; divergence (exists in prod, gone in dev) confirms a dev-only change that never reached live.
