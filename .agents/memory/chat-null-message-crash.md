---
name: Chat null-message render crash
description: Image/file-only chat messages have null `message`; always guard `msg.message` before string ops in any inbox renderer.
---

In the messaging system, a chat message can have `message === null` (image-only or file-only messages — e.g. staff sending a sample image or attachment with no text). Calling `msg.message.replace(...)` / `.trim()` / `.split()` directly throws and white-screens the *entire* conversation list, not just that one bubble.

**Why:** Reported as "customers can't view messages on mobile, just a white screen." It wasn't mobile-specific — any user opening a conversation that contained a null-text attachment message crashed. Mobile was just where customers happened to be. The file-upload features made null-text messages common.

**How to apply:** In every inbox/chat renderer (`CustomerInbox.tsx`, `StaffMessages.tsx`, and any future one) always coerce with `(msg.message || "")` before `.replace/.trim/.split`. Same caution for `msg.senderName` (guard with `msg.senderName ? ... : fallback`). When adding a new field that feeds a string op in a `.map` over messages, assume it can be null.
