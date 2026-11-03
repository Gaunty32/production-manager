---
name: DPD Local API integration
description: Which DPD API works, label format, and the safe label-print pattern.
---

- The working DPD endpoint is **DPD Local API v3.2** (`https://api.dpdlocal.co.uk`). The old DPD Web Connect endpoint (`public-ws.dpd.com`) returns 404 on login — never revert to it.
- Auth: Basic-auth login → `GeoSession` token (cache ~12h), plus `GeoClient: account/{DPD_ACCOUNT_NUMBER}` header on every call.
- Labels come back as **HTML** (GET `/shipping/shipment/{jobId}/label/` with `Accept: text/html`), not PDF.
- **Why / how to print safely:** third-party label HTML must never execute scripts in app origin. Canonical pattern (architect-approved): render sanitized HTML in a hidden iframe with `sandbox="allow-same-origin allow-modals"` (NO `allow-scripts`), then `iframe.contentWindow.print()`. Keep a regex sanitizer as defense-in-depth only.
- Booking must fail hard if DPD returns no consignment number — otherwise blank tracking numbers get saved and dispatch emails fire on failed bookings.
- Optional env: `DPD_SENDER_NAME/LINE1/TOWN/POSTCODE`, `DPD_NETWORK_CODE` (default `2^12`). Channel Islands (JE/GY) need `customsValue` + `parcelDescription`.

## Separate tracking API access

DPD's documented customer tracking API uses a separate API key/client ID and secret, not the existing DPD Local booking username/password.

**Why:** A read-only integration check confirmed the existing booking login succeeds while the documented tracking authentication rejects those same credentials with HTTP 401. Do not replace working booking credentials or assume a GeoSession grants tracking access.

**How to apply:** Use the official developer portal's live tracking credentials for `GET https://api.customers.dpd.co.uk/v1/customer/auth/access` (Basic auth); tracking uses a bearer access token plus `client-id` at `POST /v1/customer/parcel/tracking`. Sender Actions accepts parcel numbers or customer-reference searches; existing stored consignment numbers are not necessarily parcel numbers. Retrieve current schemas from `https://developers.api.dpd.co.uk/docs/apigee-customer-tracking-apis/1.0.0/schema.json` and the corresponding `apigee-customer-shipping-apis` auth schema before implementing. Never substitute sandbox example scans for genuine delivery progress.
