---
name: wouter query-only navigation
description: Why query-driven page state (e.g. ?jobId=) must use useSearch + effect, not a one-time useState initializer.
---

# wouter does not remount on query-only URL changes

A `<Route path="/messages">` matches on pathname only. Navigating from
`/messages?jobId=A` to `/messages?jobId=B` (or arriving at `/messages?jobId=X`
while the page is already mounted) changes only the query string, so wouter does
NOT remount the route component.

**Consequence:** any selection/state derived from the URL query *only* in a
`useState(() => new URLSearchParams(window.location.search)...)` initializer is
computed once at mount and then goes stale. Symptom seen: clicking a job's chat
icon left the Messages page showing whatever conversation was already open
("just opens general chat").

**Fix pattern:** read the query reactively with wouter's `useSearch()` and apply
it in a `useEffect([search])` that updates the relevant state (e.g. setTab +
setSelected). Keep the useState initializer too for the fresh-mount case.

**Why:** keeps in-app selection working (clicks call setSelected without touching
the URL, so the `[search]` effect doesn't re-run and fight the user) while making
cross-page deep-links update a mounted page.

**How to apply:** use for ANY query-driven page state in this app (wouter 3.7.1).
Do not rely on a one-time read of `window.location.search`.
