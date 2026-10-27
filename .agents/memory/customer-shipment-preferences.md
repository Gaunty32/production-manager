---
name: Customer shipment preferences
description: Preserve customer delivery requests independently of dispatch booking and billing.
---

Keep the customer's shipment choice separate from final dispatch shipping details. Do not backfill a default choice onto historical orders.

**Why:** Staff can change the actual delivery method during completion or consolidation, and those details drive carriage billing. The original customer instruction must remain visible without implying a booking has been made.

**How to apply:** Show the original request on worksheets and staff review screens; use actual dispatch fields for booking and invoicing. Default only new submissions to DPD.

Local delivery is offered within 15 miles of LS13.

**Why:** The user specified this service area for the customer portal shipment option.

**How to apply:** Preserve that service-area wording wherever the customer’s local-delivery request is displayed.

Shipping repairs must leave issued invoices unchanged. Do not guess historical parcel counts or backfill carriage charges merely because a tracking number exists.

**Why:** When approving the shipping-save fix and incomplete-shipping warning, the user explicitly chose to leave issued invoices unchanged.

**How to apply:** Save actual booking details for uninvoiced orders, warn before incomplete shipments are invoiced, and require a separate explicit decision for any historical billing correction.

Customer accounts can ship orders directly to end customers at a different postcode. Tracking must use the actual recipient's postcode, not the account address.

**Why:** DPD validates the tracking reference against the delivery postcode; an account postcode can produce an unhelpful blank error despite a valid stored tracking number.

**How to apply:** Preserve per-order delivery addresses when generating tracking links. If a custom address has no postcode, omit the postcode rather than guessing the account postcode.