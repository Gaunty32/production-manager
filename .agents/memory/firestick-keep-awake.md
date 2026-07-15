---
name: Firestick keep-awake
description: Why the TV dashboard's screensaver defence needs a VISIBLE video, and the layered approach used.
---

# Firestick / Silk screensaver keep-awake

**Rule:** A 1px / opacity-0 hidden video does NOT stop the Fire OS screensaver — TV browsers only honour "video playing, keep screen on" when the video is genuinely visible at a reasonable size.

**Why:** July 2026 — user reported the Firestick screensaver still started after a few minutes despite a hidden 1px canvas-stream video plus the Wake Lock API. Chromium/Silk deliberately ignore tiny/invisible videos when deciding to hold a screen-on flag.

**How to apply (current approach in the TV dashboard's keep-awake hook):**
- Wake Lock API, re-acquired on visibilitychange AND retried on a 30s interval (Fire OS silently drops locks).
- A 320x180 muted canvas-stream video pinned bottom-left, painting the page background colour (slate-950 #020617, alternating an imperceptibly different shade so frames aren't static) — visible to the browser, invisible to the eye.
- video.play() retried on pointerdown/keydown/visibilitychange (autoplay can be blocked until first input).

If this still isn't enough, the remaining fix is on the device itself (Fire TV screensaver settings / kiosk browser app), not in web code.
