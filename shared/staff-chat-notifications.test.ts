import assert from "node:assert/strict";
import test from "node:test";
import { generalChatSnapshot, newGeneralChatAlerts, type GeneralChatNotification } from "./staff-chat-notifications";

function chat(id: string, messageId = "first"): GeneralChatNotification {
  return {
    id, customerId: "customer",
    latestMessage: { id: messageId, message: "Hello", senderType: "customer", createdAt: "2026-10-21T10:00:00Z" },
  };
}

test("initial history and unchanged polling do not generate alerts", () => {
  const chats = [chat("general")];
  assert.deepEqual(newGeneralChatAlerts(null, chats, null), []);
  assert.deepEqual(newGeneralChatAlerts(generalChatSnapshot(chats), chats, null), []);
});

test("a reply in another general chat alerts even when a colleague has marked it read", () => {
  const previous = generalChatSnapshot([chat("general")]);
  const changed = chat("general", "reply");
  assert.deepEqual(newGeneralChatAlerts(previous, [changed], "different-chat"), [changed]);
});

test("new conversations and image-only messages generate alerts", () => {
  const changed = chat("new-chat");
  changed.latestMessage!.message = null;
  assert.deepEqual(newGeneralChatAlerts(new Map(), [changed], null), [changed]);
});

test("active conversations, archived chats and outgoing staff messages do not duplicate alerts", () => {
  const active = chat("active", "reply");
  const archived = { ...chat("archived"), archivedByStaff: true };
  const outgoing = chat("outgoing");
  outgoing.latestMessage!.senderType = "staff";
  const staffOnly = { ...chat("staff-only"), customerId: null };
  assert.deepEqual(newGeneralChatAlerts(new Map(), [active, archived, outgoing, staffOnly], "active"), []);
});

test("a snapshot advances after notification and supports older responses without message ids", () => {
  const changed = chat("general");
  delete changed.latestMessage!.id;
  const previous = generalChatSnapshot([changed]);
  changed.latestMessage = { ...changed.latestMessage!, createdAt: "2026-10-21T10:01:00Z" };
  assert.equal(newGeneralChatAlerts(previous, [changed], null).length, 1);
  assert.equal(newGeneralChatAlerts(generalChatSnapshot([changed]), [changed], null).length, 0);
});
