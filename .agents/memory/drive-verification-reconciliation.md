---
name: Drive Verification reconciliation
description: How invoice jobs are matched to the Google Drive Calculations sheet, and why the name matcher must stay lenient.
---

# Drive Verification reconciliation

The Invoicing Queue's Drive Verification panel matches each invoice job to rows on the
customer's Google Drive "Calculations" sheet by **tokenising the name and comparing token
sets (subset match), then comparing totals**. It is NOT an exact-string match.

- Tokeniser: lowercase, strip punctuation to spaces, drop stop-words (company/school
  suffixes etc.), then **glue consecutive single-character tokens together** so dotted or
  spaced initialisms reconcile (`"C.C."`, `"C C"`, `"CC"` all → `cc`).
- Mismatch kinds: `missing_drive`, `missing_invoice`, `diff` (totals differ).

**Why the matcher must stay lenient:** there IS an auto-push that writes a completed
job's name verbatim to the customer's Drive sheet, but it only fires when a job's last
line item completes (status pending→ready). Rows typed by hand on the sheet, or jobs
completed before the push existed, will still have human punctuation variants. So
reconciliation cannot rely on names being identical — the matcher absorbs minor
text variations.

**How to apply:** when reconciliation produces false mismatches from name variations,
fix the tokeniser/matching, not the data. Don't tighten matching to exact strings.
