---
name: Auth session patterns
description: How staff vs customer sessions are established and the session-fixation rule for any new login path.
---

# Auth session patterns

Two separate auth surfaces share one express-session:
- **Staff**: session key `userId`. Secure login path regenerates the session first (`req.session.regenerate` → set `userId` → `req.session.save`).
- **Customer**: session key `customerUserId` (set via `(req.session as any).customerUserId`). Impersonation overrides via `impersonationCustomerUserId`.

**Rule:** any NEW login path (password, OTP, magic link, etc.) MUST regenerate the session before attaching the auth id, then save.

**Why:** the legacy customer password login (`/api/customer-auth/login`) sets `customerUserId` WITHOUT regenerating — a session-fixation weakness. Don't copy that legacy shortcut into new code; mirror the staff regenerate pattern instead.

**How to apply:** wrap the success branch in `req.session.regenerate((err) => { ... set id ... req.session.save(...) })`. Customer lookup/CSRF state survives regenerate fine since login is a fresh start.

Passwordless OTP login lives in `login_codes` table (bcrypt-hashed 6-digit code, 10-min expiry, max 5 verify attempts, prior codes invalidated on new request, generic responses to avoid user enumeration). Routes: `/api/{staff,customer}-auth/request-code` + `/verify-code`.
