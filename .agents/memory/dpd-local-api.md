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
