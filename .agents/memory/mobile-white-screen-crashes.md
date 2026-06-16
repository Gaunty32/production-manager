---
name: Mobile white-screen crashes (no error boundary)
description: Why customer pages white-screen on iPhone but render fine on desktop, and the guards that prevent it.
---

# Mobile-only white screens (esp. customer Messages / CustomerInbox)

A blank white page = an uncaught render/effect throw. The app historically had
**no React error boundary**, so any single throw blanked the entire SPA. There is
now `client/src/components/ErrorBoundary.tsx` wrapping the Router in `App.tsx` —
keep it; it shows a "Something went wrong / Reload" fallback instead of white.

**Why mobile (iPhone/Safari) but not staff desktop (Chrome):** two classic
Safari-stricter-than-Chrome traps, both of which throw and white-screen:

1. **date-fns `format()` throws "Invalid time value"** when given an Invalid Date.
   Mobile Safari's `new Date(str)` parsing is stricter, so a date string Chrome
   accepts becomes Invalid Date on iPhone. Never call `format(new Date(x))`
   directly on API data — go through guarded helpers (`parseDate`/`safeFormat`
   in CustomerInbox).
2. **`MediaQueryList.addEventListener` throws on older iOS Safari**, which only
   supports the deprecated `addListener/removeListener`. Feature-detect before
   calling.

**Why to apply:** desktop testing will NOT reproduce these. When a customer
reports white screen on phone and server logs are all 200/304 (healthy data),
suspect one of these client-side throws, not the backend.
