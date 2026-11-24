---
name: Abode stocking workflow
description: Customer-specific personalised stocking import, fulfilment and pricing requirements.
---

Abode Home & Gifts sells personalised Christmas stockings. Keep this workflow specific to Abode; do not change other customers' behaviour.

**Why:** The user described Abode as a test of a different operating model and explicitly requested tweaks just for them.

Manage Abode stocking orders only in their dedicated sidebar section, not duplicated in the main Production Queue. Completing them there must still put them into draft invoicing.

**Why:** The user explicitly said the separate Abode section is sufficient, provided completion generates the draft invoice.

**How to apply:** Hide stocking-workflow orders from the main production view, not from the shared jobs data used for invoicing. Do not hide ordinary non-stocking Abode jobs or change other customers' queues.

The staff Abode order register must show two clear sections: “Awaiting Production” and “Despatched”. The customer screen uses “In Production” and “Despatched”.

**Why:** The user requested these exact two sections instead of the previous status-filter pills.

**How to apply:** Labels and tracking may be prepared at import, but orders stay in production until work is completed and staff explicitly confirm despatch. Delivered orders remain despatched. Draft invoicing follows production completion, independently of despatch.

For Abode, staff must confirm despatch after production; creating a label is not despatch.

**Why:** After new uploads bypassed production, the user selected “Staff confirms after production”. This supersedes their earlier “label creation means despatched” instruction.

**How to apply:** Neither a new booking nor recovering an existing label may mark despatch or queue its email. Do not infer despatch from booking dates or tracking. Show unfinished legacy auto-despatched orders in production; ensure their old markers cannot return merely on completion. Preserve historical completed despatches, confirmed deliveries, booked labels and sent-email audit records.

Enforce production eligibility at both server and customer-display boundaries, including individual stocking completion, rather than trusting a despatch timestamp alone.

**Why:** The user reported the same all-despatched customer total after the earlier server-side correction. Legacy label-created dates and an inconsistent parent completion flag must not hide unfinished stockings.

**How to apply:** Keep summary counts, register groups, order badges and exported dates consistent. Confirmed courier delivery remains authoritative; do not erase genuine deliveries or repurchase labels.

Abode must receive a despatch email for each order, to its active customer portal contacts with despatch emails enabled, not the individual stocking recipient.

**Why:** The user explicitly requested an email for every order.

**How to apply:** Only staff confirmation after completed production queues a per-order email, including confirmations without tracking. Early labels, recovery and completion alone must send nothing. Do not invent tracking, automatically catch up historical orders, or resend an email already sent prematurely.

Staff may also confirm an already-sent, completed order as despatched without supplying a label or tracking.

**Why:** The user clarified “i don't need the labels, they have been sent” when four completed orders lacked saved DPD booking details.

**How to apply:** Keep manual despatch separate from label recovery and shipment purchases. Record the confirmation date explicitly, leave missing tracking and uncertain booking details untouched, and never infer delivery.

Do not show the “DPD tracking is not connected” banner on either staff or customer screens. Despatched customer orders must clearly show the tracking number as a clickable carrier link.

**Why:** The user requested removal of the customer DPD warning, then explicitly requested removal of the remaining staff connection banner as well.

**How to apply:** Remove the connection banner, retaining actual tracking-check errors for staff. Customers should see truthful production/despatch/delivery facts and external carrier links, without needing the automatic tracking API connection.

Abode's font details are Font 1: Sad Night Script Regular; Font 2: Tabac G3 Semibold; Font 3: Stolen Times Italic.

**Why:** The user supplied these names for display in the production planner.

**How to apply:** Show the font name alongside its number for stocking production reference; preserve the original imported order details.

**How to apply:** Spreadsheet uploads create one job per order number, with individual stockings recording stocking colour, font, thread colour and the exact supplied name, preserving capitalisation. Keep each order separate. Eligible UK mainland addresses, excluding Scottish Highlands and Islands, ship via DPD as a bag. On completion, provide a DPD label and print Abode's supplied delivery-note PDF (see below). Save shipment tracking against the job, expose in-work/despatched status and tracking to Abode, and retain the existing draft-invoicing flow.

The stated prices are £7 per stocking, reducing to £5 once 100 have been produced, plus £5.50 carriage per order. The user confirmed that the system should monitor produced stockings, not uploaded orders. Anything outside standard DPD shipping needs a Parcel2Go link to book Royal Mail.

**Why:** These are the customer's agreed commercial rules as described by the user, not the standard customer pricing.

**How to apply:** Charge the first 100 produced stockings at £7 and stocking 101 onward at £5, including when the boundary falls inside one order. Fix each item's price when it is completed, not when the spreadsheet is uploaded or invoiced. Retain a lifetime count across reopening/deletion so historical production does not disappear or count twice. Royal Mail is booked externally and staff record its tracking number; do not imply Parcel2Go automatically sends tracking back.

Keep Royal Mail as the default remote-address recommendation, but staff may use an already-purchased InPost Direct label for an individual Abode order.

**Why:** The user explicitly confirmed using their supplied InPost label for a Northern Ireland order rather than buying another Royal Mail shipment.

**How to apply:** Retain the original private PDF, verify its recipient and postcode, and display InPost accurately. A masked InPost number is not full tracking; do not guess it or substitute the parcel barcode. Saving a label does not confirm production, despatch or delivery, and must not send an email.

VAT was not expressly clarified. The implementation follows the existing app's VAT-exclusive invoicing convention.

**Why:** The user answered the production threshold and delivery-exception questions but not the VAT question; preserving existing invoicing behaviour avoids introducing a separate tax convention.

**How to apply:** Keep this assumption visible when discussing prices; revise it if the user supplies different VAT terms.

Identify repeat uploads by order number and flag them for checking, including repeats whose details differ.

**Why:** The user requested: “To identify a repear upload use the order number and flag it to be checked.”

**How to apply:** Do not create a duplicate or overwrite the existing job. Flag repeat order numbers visibly for review while allowing new orders from the same sheet to be imported.

Staff should be able to attach finished-item photos to an Abode order for the customer to refer back to, using drag and drop as well as file selection.

**Why:** The user requested a picture of the finished item on the order card for customer reference, then explicitly requested drag-and-drop photo uploads.

**How to apply:** Keep final photos separate from digital samples, linked to the matching individual stocking in both staff and customer views; customer access is read-only. Keep older order-level photos visible. Photos are optional reference material, not a production-completion or dispatch requirement.

Abode no longer supplies samples for customer approval; staff upload photographs of finished products instead. This supersedes the previous per-stocking sample-approval workflow.

**Why:** The user said: “we are no longer supplying a sample for customer approval, but we are uploading a photograph of the finished product.”

**How to apply:** Do not show sample-approval actions or hold production/completion/despatch for old pending samples. Retain historical sample files and decisions without deleting them. Keep finished photographs linked to their stockings and visible to the customer.

Orders and their delivery-note PDFs should be uploaded together, and DPD labels should be available to print at import, before production is finished. Abode uses Expresspak 5 Next Day with a default weight of 4 kg.

**Why:** The user requested delivery notes and printable labels at order upload, then specified: “We are using the product expresspak 5 on a next day service, default weight 4 kgs.”

**How to apply:** Treat label creation as a real courier booking, but not as despatch. Keep imports and note attachment retry-safe, preserve one note per order, and never automatically repeat an uncertain courier purchase.

Manual Abode label booking should book directly, without a warning-filled confirmation.

**Why:** The user said: “we don't need all the warning messages, just book the label.”

**How to apply:** Keep the normal booking action direct; retain genuine failure/recovery messages and duplicate-booking protection.

Retrying a reviewed DPD booking requires staff to check the carrier account and explicitly confirm no shipment exists; ordinary retries must remain blocked.

**Why:** DPD has rejected Abode imports with “Maximum length exceeded”, leaving no saved tracking, but missing local tracking alone cannot rule out a remote purchase. An uncertain purchase must never be repeated automatically.

**How to apply:** Keep normal new bookings direct. Reviewed orders need the explicit no-existing-booking confirmation, must have no saved shipment evidence, and still need an atomic single-flight claim. Recover an existing shipment instead whenever DPD has already booked it.

A DPD rejection log does not prove that no booking exists for the order; staff's carrier screenshot may show an existing shipment despite missing planner data.

**Why:** The user supplied carrier evidence of a real booking after the planner had recorded a length-validation failure. Requiring a label PDF or despatch confirmation just to save its known consignment number added unnecessary barriers.

**How to apply:** Let staff save verified existing tracking for reviewed bookings without a label PDF. Preserve production, despatch and delivery states and unknown booking dates; do not send email or repurchase. Treat saving tracking and recovering a printable label as separate operations.

Abode needs the courier label as a PDF, its tracking code, and the master order spreadsheet updated from the booking.

**Why:** The user said: “i just need a label as a PDF and the tracking code and the spreadsheet updated.”

**How to apply:** Save booking details before label rendering. For a shipment already booked in DPD, retrieve and verify that same shipment rather than buying a replacement.

DPD can return HTTP 200 containing a JSON application error instead of label HTML, including “requested resource is not available for updating” for an existing shipment.

**Why:** A saved, previously printable label could no longer be retrieved, and treating the response as HTML produced a misleading order-verification error.

**How to apply:** Reject non-HTML courier responses as unavailable labels. Allow staff to recover using the original saved PDF, checking its order reference and tracking number before saving it; never repurchase the shipment. Retain the original PDF in private storage.

Missing tracking and label attachments in the live database do not mean the original courier label is unavailable. Check previously generated label assets and uploaded screenshots before asking the user for the numbers again.

**Why:** The user pointed out that the numbers were already on labels; an original saved PDF was available outside the job's attachments.

**How to apply:** Search generated assets as well as uploads, verify the order reference against the label's consignment number, and distinguish finding a number from saving it to the live portal.

The customer needs a master spreadsheet list of orders showing despatch dates, delivered dates and tracking numbers, with automatic DPD tracking rather than staff-entered delivered dates.

**Why:** The user requested the master list and selected “Connect automatic DPD tracking”.

**How to apply:** Show only the customer's own orders and provide an Excel download. Delivered dates must come from confirmed courier delivery, not booking dates, next-day estimates or completion dates. Separate tracking API access is required; never invent delivery dates when it is absent. Do not restore the removed connection banner.

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

Customers may supply delivery-note PDFs at the same time as their order sheet, rather than importing orders and notes as separate tasks.

**Why:** The user asked for delivery-note drag and drop and asked, “Can i import a delivery note at the same time as an order sheet.”

**How to apply:** Allow a mixed selection of one spreadsheet and multiple PDFs; create the orders before matching and saving notes. Keep failed attachments retryable without repeating the order import or courier booking.

Retain an independent in-memory PDF as soon as a delivery note is selected, before waiting for imports or label bookings. Reselecting the same file must replace a failed device handle.

**Why:** The browser reported “A requested file or directory could not be found” for some selected PDFs after import, while others uploaded. Retrying the same inaccessible device file cannot restore its bytes.

**How to apply:** Use the retained PDF for upload retries across mixed import, bulk and per-order controls. If the initial read fails, explicitly ask for a locally saved file to be selected again; preserve successful notes, saved object keys and all booking results.

Show only “In Production” and “Despatched” totals in the stocking-room summary, for staff and customers.

**Why:** The user said the seven summary cards were too much: “In Production and Despatched is all we need.” This supersedes earlier requests for additional totals.

**How to apply:** Count orders, not stockings, using the same two groups as the register. Keep delivery-note and production details on individual orders, not extra summary cards.
