---
name: External tokened embeds
description: How the TV dashboard embeds screens from the user's other apps without leaking tokens
---

The TV dashboard can embed screens from the user's other Replit apps (e.g. the Order System at wardrobe.selectbranding.co.uk) as iframe rotation pages, using that app's own token-protected read-only display URL.

**Rule:** never hardcode the tokened URL in client code or replit.md — it ships in the public JS bundle and git history. Keep it in an env var (e.g. `ORDER_SYSTEM_TV_URL`) and return it from the TV data endpoint, which already validates this app's own TV token.

**Why:** architect review failed the first version for credential exposure; the SPA bundle is downloadable without login even though the app is staff-only.

**How to apply:** any future cross-app embed gets its URL via env var + the token-gated data response; the rotation page only appears when the value is set. Also remember the other app's dev and prod use separate databases — tokens created in its workspace won't work on the published site until republished/stored where prod reads it.
