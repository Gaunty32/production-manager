---
name: Xero invoice line verification
description: Prevent database invoice status from disagreeing with the invoice that Xero actually created.
---

**Rule:** After creating an invoice, verify Xero returned every expected line with matching description, quantity, and unit amount before marking jobs as invoiced.

**Why:** A production job was linked to an invoice and given an internal invoice total even though the customer-facing Xero invoice did not show the job. Saving status from the selected-job list alone created a silent mismatch.

**How to apply:** Treat an invoice number as proof only that Xero created an invoice, not that all requested lines were accepted. On mismatch, preserve the invoice number in the error and require staff to inspect that Xero invoice before retrying.

Invoice-preview quantity edits are billing-only drafts; do not overwrite the original production quantities. Apply overrides after matching lines are combined, and retain them if invoice generation fails.

**Why:** The user asked to edit quantities in the Xero preview and have them saved until the invoice is generated. A single preview row can combine multiple production lines; applying its edited total before combining would add the other production quantities back in and overbill.

**How to apply:** Keep preview and Xero generation aligned on the same merged-row quantity, including the recorded invoice total. Only discard quantity drafts after successful Xero verification and invoice-status updates.