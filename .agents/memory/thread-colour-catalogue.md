---
name: Thread colour catalogue decisions
description: Supplied reference colours must reach production on publish without relying on development database imports.
---

Treat user-supplied .TCH reference catalogues as publishable application data, while preserving later staff imports as overrides.

**Why:** Importing into the development database alone does not update the live library; the user expects supplied shades to become available when publishing. Production database mutations from agent tools are not allowed.

**How to apply:** Include supplied reference shade data with the app. Match by thread range and code, never code alone; do not assume a Classic 40 catalogue also proves colours for Classic 60 or Poly Neon 60.

The user wants the shade card to include a shade only when its code is in their Google Sheet list, checking all three tabs daily at 08:00 UK time.

**Why:** The .TCH file supplies reference shades, not permission to display the whole manufacturer's range.

**How to apply:** Apply the Sheet allow-list to both staff and customer shade cards. Preserve the daily list across restarts, handle GMT/BST, and retain the last successful list if Google is temporarily unavailable.

The customer's dashboard entry is "Thread Library", replacing Documents. Customers should see the listed thread codes, shades and range (PolyNeon60, Classic 60 or Classic 40), with code search and numerical ordering.

**Why:** The user wants the stock thread reference directly accessible to customers, rather than behind Documents.

**How to apply:** Preserve the top-of-page wording: "We are continually adding to our thread library. If we do not have the exact thread in stock then we can either offer an alternative shade, or in certain circumstances order it in and add it to our library." If shade data is unavailable, say so without inventing a colour or suggesting that a listed thread is out of stock.
