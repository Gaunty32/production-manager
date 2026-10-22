---
name: General Chat staff notifications
description: General Chat arrival alerts and explicit identity requirements for staff mention emails.
---

Detect new General Chat arrivals by the latest customer message identity, not solely by a rise in unread counts.

**Why:** Conversation read state is shared across staff. A colleague with that chat open can mark a new message read before another staff client's polling runs; an unread-count-only alert then misses the arrival. The sidebar also deliberately suppresses its generic toast on the Messages page, so that page must cover non-selected conversations itself.

**How to apply:** Establish a baseline on first successful load to avoid historical alerts, advance it after each successful poll, and avoid duplicate alerts for the selected conversation. Respect existing staff email-notification preferences rather than enabling them for everyone during a notification bug fix.

Staff mention emails require deliberately selecting the staff person from the mention list. Never infer a staff recipient from a typed first-name handle.

**Why:** The user confirmed that customer/staff name collisions must not generate staff emails; selecting a customer with the same first name is not a staff mention.

**How to apply:** Carry the selected identity separately from visible message text in both order and general chats. Customer selections and unselected typed handles must not trigger staff mention emails. Editing or deleting a selected name must invalidate its recipient rather than silently retarget it.
