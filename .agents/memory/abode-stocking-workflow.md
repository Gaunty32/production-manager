---
name: Abode stocking workflow
description: Customer-specific personalised stocking import, fulfilment and pricing requirements.
---

Abode Home & Gifts sells personalised Christmas stockings. Keep this workflow specific to Abode; do not change other customers' behaviour.

**Why:** The user described Abode as a test of a different operating model and explicitly requested tweaks just for them.

Abode's font details are Font 1: Sad Night Script Regular; Font 2: Tabac G3 Semibold; Font 3: Stolen Times Italic.

**Why:** The user supplied these names for display in the production planner.

**How to apply:** Show the font name alongside its number for stocking production reference; preserve the original imported order details.

**How to apply:** Spreadsheet uploads create one job per order number, with individual stockings recording stocking colour, font, thread colour and the exact supplied name, preserving capitalisation. Keep each order separate. Eligible UK mainland addresses, excluding Scottish Highlands and Islands, ship via DPD as a bag. On completion, provide a DPD label and print Abode's supplied delivery-note PDF (see below). Save shipment tracking against the job, expose in-work/despatched status and tracking to Abode, and retain the existing draft-invoicing flow.

The stated prices are £7 per stocking, reducing to £5 once 100 have been produced, plus £5.50 carriage per order. The user confirmed that the system should monitor produced stockings, not uploaded orders. Anything outside standard DPD shipping needs a Parcel2Go link to book Royal Mail.

**Why:** These are the customer's agreed commercial rules as described by the user, not the standard customer pricing.

**How to apply:** Charge the first 100 produced stockings at £7 and stocking 101 onward at £5, including when the boundary falls inside one order. Fix each item's price when it is completed, not when the spreadsheet is uploaded or invoiced. Retain a lifetime count across reopening/deletion so historical production does not disappear or count twice. Royal Mail is booked externally and staff record its tracking number; do not imply Parcel2Go automatically sends tracking back.

VAT was not expressly clarified. The implementation follows the existing app's VAT-exclusive invoicing convention.

**Why:** The user answered the production threshold and delivery-exception questions but not the VAT question; preserving existing invoicing behaviour avoids introducing a separate tax convention.

**How to apply:** Keep this assumption visible when discussing prices; revise it if the user supplies different VAT terms.

Identify repeat uploads by order number and flag them for checking, including repeats whose details differ.

**Why:** The user requested: “To identify a repear upload use the order number and flag it to be checked.”

**How to apply:** Do not create a duplicate or overwrite the existing job. Flag repeat order numbers visibly for review while allowing new orders from the same sheet to be imported.

Staff should be able to attach finished-item photos to an Abode order for the customer to refer back to.

**Why:** The user requested a picture of the finished item on the order card for customer reference.

**How to apply:** Keep final photos separate from digital samples, linked to the matching individual stocking in both staff and customer views; customer access is read-only. Keep older order-level photos visible. Photos are optional reference material, not a production-completion or dispatch requirement.

Abode no longer supplies samples for customer approval; staff upload photographs of finished products instead. This supersedes the previous per-stocking sample-approval workflow.

**Why:** The user said: “we are no longer supplying a sample for customer approval, but we are uploading a photograph of the finished product.”

**How to apply:** Do not show sample-approval actions or hold production/completion/despatch for old pending samples. Retain historical sample files and decisions without deleting them. Keep finished photographs linked to their stockings and visible to the customer.

Orders and their delivery-note PDFs should be uploaded together, and DPD labels should be available to print at import, before production is finished. Abode uses Expresspak 5 Next Day with a default weight of 4 kg.

**Why:** The user requested delivery notes and printable labels at order upload, then specified: “We are using the product expresspak 5 on a next day service, default weight 4 kgs.”

**How to apply:** Treat label creation as a real courier booking, never as actual despatch. Never send a despatch email or count an order as despatched just because it has tracking. Keep imports and note attachment retry-safe, preserve one note per order, and never automatically repeat an uncertain courier purchase.

Manual Abode label booking should book directly, without a warning-filled confirmation.

**Why:** The user said: “we don't need all the warning messages, just book the label.”

**How to apply:** Keep the normal booking action direct; retain genuine failure/recovery messages and duplicate-booking protection.

The customer needs a master spreadsheet list of orders showing despatch dates, delivered dates and tracking numbers, with automatic DPD tracking rather than staff-entered delivered dates.

**Why:** The user requested the master list and selected “Connect automatic DPD tracking”.

**How to apply:** Show only the customer's own orders and provide an Excel download. Delivered dates must come from confirmed courier delivery, not booking dates, next-day estimates or completion dates. Separate tracking API access is required; absent access must be visible rather than silently inventing dates.

Abode supplies its own delivery-note PDFs for staff to print and enclose; either staff or the customer may upload them, and the filename identifies the order.

**Why:** The user supplied dispatch-note examples and explicitly requested uploads by either side, with printing against the matching order. They then confirmed: “we can abandon our delivery notes and use these instead.”

**How to apply:** Match the whole order number from the filename, flag unmatched files rather than guessing, and preserve the original PDF and all pages. Use only supplied PDFs, with no generated delivery-note fallback for Abode. Flag missing notes for upload instead. These notes may include Abode's retail prices; do not substitute our production prices. Other customers' delivery-note behaviour is unchanged.

Delivery notes must be accessible on each customer's order card, with a way to check the saved PDF or upload one there, not only through the bulk uploader above the orders.

**Why:** The user said: “It shoudl show here for the customer to check or upload.”

**How to apply:** Keep saved notes visible alongside an order-level upload control. Only report a note as attached after it has actually been saved to that order.

Each order has one delivery note, not delivery-note revisions.

**Why:** The user said: “we don't need to upload another version of the delivery note. each order just has one delivery note.”

**How to apply:** Skip already-attached orders in bulk uploads and offer order-level upload only when no note is saved. Enforce this atomically across staff/customer uploads. Preserve existing stored files rather than deleting historical duplicates.

Bulk delivery-note selection should match automatically and accept multiple PDFs in a drop, including additional batches without replacing the existing selection.

**Why:** The user requested: “i would like this to auto match and i would like to drag more than one file at a time.”

**How to apply:** Start filename matching on selection/drop; keep the explicit upload step separate from matching so unmatched PDFs are never saved.

Keep the “Awaiting delivery note” order total in the stocking-room summary. The earlier “Awaiting approval” total is superseded by removal of sample approval.

**Why:** The user requested both statuses alongside the existing summary totals.

**How to apply:** Count orders, not stockings. Missing-note totals include undispatched orders even when production is complete or a label has already been created.
