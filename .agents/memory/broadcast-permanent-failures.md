---
name: Broadcast permanent failures
description: How broadcast recipient failures are persisted and separated from retryable provider errors
---

**Rule:** Weekly article campaigns and one-off customer broadcasts must exclude
email addresses with a recorded permanent recipient failure. Normalize addresses
before storage and lookup. Do not permanently suppress rate limits, provider
outages, authentication/configuration errors, or other transient failures.

**Why:** Repeatedly attempting invalid or provider-suppressed recipients harms
deliverability, while treating every send error as permanent would silently
remove valid customers during a temporary Resend problem.

**How to apply:** Filter persistent permanent failures when building preview and
send audiences, re-check before each scheduled send, and record only
recipient-specific permanent errors returned by the email provider. Apply the
same rule to any new bulk-email path.