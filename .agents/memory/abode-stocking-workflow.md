---
name: Abode stocking workflow
description: Customer-specific personalised stocking import, fulfilment and pricing requirements.
---

Abode Home & Gifts sells personalised Christmas stockings. Keep this workflow specific to Abode; do not change other customers' behaviour.

**Why:** The user described Abode as a test of a different operating model and explicitly requested tweaks just for them.

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

Digital samples need customer approval for each individual stocking before production, not a single approval for the whole order. A customer can request changes; a revised sample needs fresh approval.

**Why:** The user requested: “upload our digital sample for each of these for the customer to approve, once approved we will process and despatch and upload a picture of the final produced stocking”, then chose “Each stocking”.

**How to apply:** Preserve version/decision history and customer notes. Only the customer using their own login can approve; staff impersonation is read-only for decisions. Gate generic production/completion paths as well as the Abode screen, and never reuse an old revision's approval. Already completed historical stockings without samples are not retroactively put on hold, since they were produced before this requirement.

Customers review digital samples as on-screen previews, with hover enlargement and a mobile tap-to-enlarge alternative, then approve or reject with notes. Do not make them open or download the source PDF to review it.

**Why:** The user said: “from the customers screen, they need to see a preview of the sample for approval only, as long as when they hover they can view it on screen. Then either approve or reject and add notes.”

**How to apply:** Keep customer review within the portal, including PDFs and earlier versions. Rejection requires notes and requests a revision rather than cancelling the stocking order.

Abode supplies its own delivery-note PDFs for staff to print and enclose; either staff or the customer may upload them, and the filename identifies the order.

**Why:** The user supplied dispatch-note examples and explicitly requested uploads by either side, with printing against the matching order. They then confirmed: “we can abandon our delivery notes and use these instead.”

**How to apply:** Match the whole order number from the filename, flag unmatched files rather than guessing, and preserve the original PDF and all pages. Use only supplied PDFs, with no generated delivery-note fallback for Abode. Flag missing notes for upload instead. These notes may include Abode's retail prices; do not substitute our production prices. Other customers' delivery-note behaviour is unchanged.

Delivery notes must be accessible on each customer's order card, with a way to check the saved PDF or upload one there, not only through the bulk uploader above the orders.

**Why:** The user said: “It shoudl show here for the customer to check or upload.”

**How to apply:** Keep saved notes visible alongside an order-level upload control. Only report a note as attached after it has actually been saved to that order.
