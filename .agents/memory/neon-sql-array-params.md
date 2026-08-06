---
name: Neon SQL array parameters
description: Passing JS arrays into drizzle sql`` templates fails on Neon — how to do it safely.
---

Passing a JS array directly into a drizzle `sql\`\`` template (e.g. `= ANY(${ids}::varchar[])`) fails on the Neon websocket driver with `malformed array literal` — the array is serialized as a plain string, not a Postgres array.

**Why:** the driver binds the JS array as one text parameter; Postgres then tries to parse it as an array literal and rejects it.

**How to apply:** pass the list as JSON and expand it server-side: `WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`. Injection-safe and works for any element type (cast as needed).
