---
name: Client auto-refresh on republish
description: How open clients (esp. customer phones) auto-reload to a newly published build, and why the version value must be deterministic.
---

# Auto-refreshing open clients after a republish

`useVersionCheck` (client) polls `GET /api/version` (~60s + on tab focus),
remembers the first-seen version, and reloads when it changes — so a freshly
published fix reaches already-open phones/tablets without a manual refresh.
A 10pm daily reload remains as a safety net for long-lived tabs.

**Critical constraint — the version MUST be deterministic across server
instances.** Production runs on Cloud Run, which can spin up multiple instances.
If `/api/version` returns each instance's start time (`Date.now()`), instances
disagree and clients reload-loop forever. So the server derives the version by
**hashing the built client `index.html`** (which references Vite content-hashed
bundles): identical across instances for one build, changes on every republish.
Dev falls back to a timestamp (no build dir).

Loop-safety on the client: require the new version on 2 consecutive polls
(hysteresis) AND a 5-min cooldown between auto-reloads, so a brief mixed-instance
rollout window can't bounce a client.

**Caveat:** a backend-only republish that leaves frontend assets byte-identical
won't change the hash, so clients won't reload — acceptable, since there's no UI
change to pick up.
