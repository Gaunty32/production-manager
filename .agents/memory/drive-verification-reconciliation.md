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

## Customer sheets are structurally inconsistent (two more failure modes)

Customer-maintained Calculations sheets do NOT share a layout or naming convention:

- **Price column varies.** Some sheets put the order value in the `total` column (H);
  others leave `total` blank or full of junk (e.g. `"1 box"`) and put the real value in
  `embCost` (G). Read the amount as `parseMoney(total) ?? parseMoney(embCost) ?? 0`, where
  `parseMoney` only accepts a clean numeric cell (rejects `""` and `"1 box"` — plain
  `parseFloat("1 box")` wrongly yields `1`).
- **Rows can be named by the END-CLIENT, not the job code.** e.g. invoice job `PB-ESS3-21`
  appears on the sheet as two lines named `"Furniture Outlet"`. No token overlap is
  possible, so name matching can never link them.

**Amount-based fallback:** after name bucketing, pair a leftover invoice-only bucket with a
leftover drive-only bucket whose totals are equal (≤ £0.01). The amounts summing to the
invoice total is the only reliable signal when names differ.
**Guard against false positives:** only auto-match when that amount is **unique on both
sides** (count totals in each leftover set; require exactly 1 each). Exclude POA invoices
from amount matching. **Why:** two unrelated orders with the same total must not silently
reconcile and hide a real discrepancy on a money/invoicing screen.
