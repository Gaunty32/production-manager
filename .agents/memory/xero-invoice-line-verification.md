---
name: Xero invoice line verification
description: Prevent database invoice status from disagreeing with the invoice that Xero actually created.
---

**Rule:** After creating an invoice, verify Xero returned every expected line with matching description, quantity, and unit amount before marking jobs as invoiced.

**Why:** A production job was linked to an invoice and given an internal invoice total even though the customer-facing Xero invoice did not show the job. Saving status from the selected-job list alone created a silent mismatch.

**How to apply:** Treat an invoice number as proof only that Xero created an invoice, not that all requested lines were accepted. On mismatch, preserve the invoice number in the error and require staff to inspect that Xero invoice before retrying.