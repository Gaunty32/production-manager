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

## Installed PWA boot recovery

The standalone app can retain an old service worker across a deployment. If its
HTML and content-hashed dynamic chunks no longer match, the initial dynamic
import can fail before React mounts, leaving a completely white window.

**Why:** Browser tabs naturally recover through fresh navigation more reliably
than an already-installed PWA window, so production can work in the browser
while the installed app remains blank.

**How to apply:** Keep a rejection handler around the initial app-module import.
On the first boot failure, unregister workers, clear Cache Storage and reload
once; on a second failure, render a visible refresh message instead of a blank
root. Bump the service-worker cache name when changing entry-point structure.

Legacy installed Planner shortcuts may launch at `/#/dashboard`. Normalize any
boot-time `#/...` route into a pathname before selecting the public or portal
entry; otherwise the entry splitter sees `/` and can boot the wrong app.
