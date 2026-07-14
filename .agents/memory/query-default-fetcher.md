---
name: Default query fetcher ignores object queryKey segments
description: TanStack Query default queryFn joins queryKey with "/" — object params become "[object Object]".
---

The app's default query function (`client/src/lib/queryClient.ts`) builds the URL as `queryKey.join("/")`. An object segment like `["/api/x", {a, b}]` becomes `/api/x/[object Object]` — params are silently lost.

**Why:** Discovered when the Data Quality report tab returned nothing; the same pattern nearly shipped twice (Staff Productivity tab already worked around it).

**How to apply:** Any query needing query-string params must provide an explicit `queryFn` that builds `?a=...&b=...` itself (keep the object in the queryKey for cache identity). Path-segment keys like `["/api/jobs", id]` are fine with the default fetcher.
