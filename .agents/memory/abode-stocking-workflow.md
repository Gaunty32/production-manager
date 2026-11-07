---
name: Abode stocking workflow
description: Customer-specific personalised stocking import, fulfilment and pricing requirements.
---

Abode Home & Gifts sells personalised Christmas stockings. Keep this workflow specific to Abode; do not change other customers' behaviour.

**Why:** The user described Abode as a test of a different operating model and explicitly requested tweaks just for them.

**How to apply:** Spreadsheet uploads create one job per order number, with individual stockings recording stocking colour, font, thread colour and the exact supplied name, preserving capitalisation. Keep each order separate. Eligible UK mainland addresses, excluding Scottish Highlands and Islands, ship via DPD as a bag. On completion, provide a DPD label and a personalised delivery note with Abode's logo. Save shipment tracking against the job, expose in-work/despatched status and tracking to Abode, and retain the existing draft-invoicing flow.

The stated prices are £7 per stocking, reducing to £5 once 100 have been produced, plus £5.50 carriage per order. The user confirmed that the system should monitor produced stockings, not uploaded orders. Anything outside standard DPD shipping needs a Parcel2Go link to book Royal Mail.

**Why:** These are the customer's agreed commercial rules as described by the user, not the standard customer pricing.

**How to apply:** Charge the first 100 produced stockings at £7 and stocking 101 onward at £5, including when the boundary falls inside one order. Fix each item's price when it is completed, not when the spreadsheet is uploaded or invoiced. Retain a lifetime count across reopening/deletion so historical production does not disappear or count twice. Royal Mail is booked externally and staff record its tracking number; do not imply Parcel2Go automatically sends tracking back.

VAT was not expressly clarified. The implementation follows the existing app's VAT-exclusive invoicing convention.

**Why:** The user answered the production threshold and delivery-exception questions but not the VAT question; preserving existing invoicing behaviour avoids introducing a separate tax convention.

**How to apply:** Keep this assumption visible when discussing prices; revise it if the user supplies different VAT terms.

Identify repeat uploads by order number and flag them for checking, including repeats whose details differ.

**Why:** The user requested: “To identify a repear upload use the order number and flag it to be checked.”

**How to apply:** Do not create a duplicate or overwrite the existing job. Flag repeat order numbers visibly for review while allowing new orders from the same sheet to be imported.
