---
name: Public homepage performance
description: Why public marketing routes use a separate client entry from the operational portal.
---

Keep the public homepage, demo-access, Knowledge Centre and privacy routes on the lightweight public client entry. Do not import the staff/customer application shell into that startup path. Keep meaningful hero content in the initial HTML response, and defer below-the-fold interactive dependencies until their section approaches the viewport.

**Why:** A shared entry made the public homepage download operational portal code before it could paint, producing poor external speed scores despite reasonably compressed media. The external score improved after separating the entry, confirming startup code—not image compression alone—was a material bottleneck.

**How to apply:** Add marketing-only dependencies to the public entry. Add portal/staff routes and shared operational chrome only to the main app entry. Preserve the initial hero shell, and lazy-load form libraries or other below-the-fold widgets behind an intersection boundary.

When authenticated staff leave the public entry for `/dashboard`, use a full
document navigation (`location.replace`/`location.href`), not Wouter
client-side navigation. The public router does not contain planner routes, so a
history-only transition to `/dashboard` renders a blank page instead of loading
the full app entry.