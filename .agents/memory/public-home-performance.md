---
name: Public homepage performance
description: Why public marketing routes use a separate client entry from the operational portal.
---

Keep the public homepage, demo-access, Knowledge Centre and privacy routes on the lightweight public client entry. Do not import the staff/customer application shell into that startup path. Keep meaningful hero content in the initial HTML response, and defer below-the-fold interactive dependencies until their section approaches the viewport.

**Why:** A shared entry made the public homepage download operational portal code before it could paint, producing poor external speed scores despite reasonably compressed media. The external score improved after separating the entry, confirming startup code—not image compression alone—was a material bottleneck.

**How to apply:** Add marketing-only dependencies to the public entry. Add portal/staff routes and shared operational chrome only to the main app entry. Preserve the initial hero shell, and lazy-load form libraries or other below-the-fold widgets behind an intersection boundary.

Initial public HTML shells must match the requested route. Never show the
homepage hero on a Knowledge Centre URL while its lazy chunk loads; use a
Knowledge Centre-branded neutral skeleton instead.

**Why:** A shared homepage shell made direct article links briefly display the
wrong page before React mounted, which looked like an unnecessary redirect.

**How to apply:** When adding another lazy public route, either give it a
route-specific initial shell or use a neutral shell that cannot be mistaken for
another page.

When authenticated staff leave the public entry for `/dashboard`, use a full
document navigation (`location.replace`/`location.href`), not Wouter
client-side navigation. The public router does not contain planner routes, so a
history-only transition to `/dashboard` renders a blank page instead of loading
the full app entry.

The static marketing shell on `/` must use staff-session state injected into the
initial HTML response. Do not hide it behind a client-side auth request: that
delays first content on cold loads. Keep the neutral planner shell when the
injected session belongs to staff; otherwise show the marketing hero during HTML
parsing. Retain a client-side auth check only as a fallback when no snapshot was
injected.

**Why:** Waiting for `/api/staff-auth/user` kept meaningful HTML hidden and made
first content depend on an extra round trip. Server-injected session state
preserves the no-flash staff handoff without penalising anonymous visitors.

**How to apply:** Any server path that transforms or serves the SPA index must
replace the auth snapshot placeholder from the current request session. Do not
let static middleware serve `index.html` before that transformation.

Production must keep Express response compression enabled before API and static
middleware. The hosting proxy does not automatically compress these assets; without
app-level compression, hashed JS/CSS and HTML are transferred at full size.

**Why:** Live asset checks showed no Content-Encoding despite large bundles; app-level
gzip reduced representative HTML from about 52 KB to 16 KB and the main JS from
about 332 KB to roughly 101 KB.

**How to apply:** Preserve compression middleware ordering and verify with a request
that sends `Accept-Encoding: gzip`; expect `Content-Encoding: gzip` and `Vary:
Accept-Encoding`.