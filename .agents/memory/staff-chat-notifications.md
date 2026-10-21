---
name: General Chat staff notifications
description: Shared read state is not a reliable signal for notifying each open staff client about a new customer message.
---

Detect new General Chat arrivals by the latest customer message identity, not solely by a rise in unread counts.

**Why:** Conversation read state is shared across staff. A colleague with that chat open can mark a new message read before another staff client's polling runs; an unread-count-only alert then misses the arrival. The sidebar also deliberately suppresses its generic toast on the Messages page, so that page must cover non-selected conversations itself.

**How to apply:** Establish a baseline on first successful load to avoid historical alerts, advance it after each successful poll, and avoid duplicate alerts for the selected conversation. Respect existing staff email-notification preferences rather than enabling them for everyone during a notification bug fix.
