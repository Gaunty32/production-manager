import test from "node:test";
import assert from "node:assert/strict";
import type { Customer, Job } from "@shared/schema";
import { needsAwaitingGarmentsReminder, awaitingGarmentsReminderWeek, awaitingGarmentsSince } from "./awaitingGarmentsReminderRules";
import { buildAwaitingGarmentsReminderEmail } from "./awaitingGarmentsReminderEmail";
import { deliverAwaitingGarmentsReminder, type GarmentsDeliveryState, type GarmentsPayload, type GarmentsReminderStore } from "./awaitingGarmentsReminderDelivery";

const now = new Date("2026-10-14T12:00:00Z");
const customer = { active: true, requiresAdvancePayment: false } as Customer;
const job = {
  status: "production", completed: false, goodsReceived: null, rejectedAt: null,
  dhlTrackingNumber: null, invoiceStatus: "pending", paymentReceived: false,
  submittedAt: new Date("2026-10-07T12:00:00Z"), approvedAt: null,
} as Job;
test("seven-day boundary is inclusive and approval starts a later waiting period", () => {
  assert.equal(needsAwaitingGarmentsReminder(job, customer, false, now), true);
  assert.equal(needsAwaitingGarmentsReminder(job, customer, false, new Date(now.getTime() - 1)), false);
  assert.equal(needsAwaitingGarmentsReminder({ ...job, approvedAt: new Date("2026-10-10") }, customer, false, now), false);
  assert.equal(awaitingGarmentsSince({ submittedAt: null, approvedAt: null }), null);
  assert.equal(needsAwaitingGarmentsReminder({ ...job, submittedAt: new Date("invalid") }, customer, false, now), false);
});
test("receiving goods, adding line items, closing jobs or inactive/payment-blocked accounts stops reminders", () => {
  assert.equal(needsAwaitingGarmentsReminder(job, customer, true, now), false);
  for (const change of [
    { goodsReceived: now }, { completed: true }, { status: "pending_customer_approval" },
    { status: "rejected" }, { status: "cancelled" }, { rejectedAt: now },
    { invoiceStatus: "ready" }, { invoiceStatus: "invoiced" }, { dhlTrackingNumber: "shipment" },
  ]) assert.equal(needsAwaitingGarmentsReminder({ ...job, ...change }, customer, false, now), false);
  assert.equal(needsAwaitingGarmentsReminder(job, { ...customer, active: false }, false, now), false);
  assert.equal(needsAwaitingGarmentsReminder(job, { ...customer, requiresAdvancePayment: true }, false, now), false);
  assert.equal(needsAwaitingGarmentsReminder({ ...job, paymentReceived: true }, { ...customer, requiresAdvancePayment: true }, false, now), true);
});
test("weekly Monday 09:00 follows UK summer/winter time and catches up in the current week", () => {
  assert.equal(awaitingGarmentsReminderWeek(new Date("2026-07-06T07:59:59Z")), null);
  assert.equal(awaitingGarmentsReminderWeek(new Date("2026-07-06T08:00:00Z")), "2026-07-06");
  assert.equal(awaitingGarmentsReminderWeek(new Date("2026-12-07T08:59:59Z")), null);
  assert.equal(awaitingGarmentsReminderWeek(new Date("2026-12-07T09:00:00Z")), "2026-12-07");
  assert.equal(awaitingGarmentsReminderWeek(now), "2026-10-12");
});

const email = {
  to: ["customer@example.test"], customerName: "Example", firstName: "<Customer>",
  jobs: [
    { id: "one", number: 123, name: "<script>bad</script>", po: "PO & 1", quantity: 10, waitingSince: "2026-10-01T12:00:00Z" },
    { id: "two", number: 124, name: "Second job", po: null, quantity: 20, waitingSince: "2026-10-02T12:00:00Z" },
  ],
};
const payload: GarmentsPayload = { email, rendered: buildAwaitingGarmentsReminderEmail(email) };
test("one branded reminder lists both jobs, escapes HTML and asks rather than asserts garments are missing", () => {
  assert.ok(payload.rendered.html.includes("Second job"));
  assert.ok(payload.rendered.html.includes("&lt;script&gt;"));
  assert.ok(!payload.rendered.html.includes("<script>bad"));
  assert.ok(payload.rendered.text.includes("usually means"));
  assert.ok(payload.rendered.text.includes("If you have already sent them"));
  assert.ok(payload.rendered.text.includes("PO & 1"));
});
class MemoryStore implements GarmentsReminderStore {
  rows = new Map<string, GarmentsDeliveryState>();
  tail: Promise<unknown> = Promise.resolve();
  mutate<T>(key: string, update: (state: GarmentsDeliveryState) => { state: GarmentsDeliveryState; result: T }): Promise<T> {
    const operation = this.tail.then(() => {
      const result = update(this.rows.get(key) || { status: "pending" });
      this.rows.set(key, structuredClone(result.state));
      return result.result;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
test("parallel scans and restarts send only once per customer/week, while next week sends again", async () => {
  const store = new MemoryStore();
  let sends = 0;
  const send = async () => { sends++; return "provider"; };
  await Promise.all(Array.from({ length: 5 }, () => deliverAwaitingGarmentsReminder(store, "week-one", async () => payload, send)));
  assert.equal(sends, 1);
  assert.equal(await deliverAwaitingGarmentsReminder(store, "week-one", async () => payload, send), "sent");
  await deliverAwaitingGarmentsReminder(store, "week-two", async () => payload, send);
  assert.equal(sends, 2);
});
test("transient failures retry with the same frozen payload and provider key", async () => {
  const store = new MemoryStore();
  let sends = 0;
  const send = async (data: GarmentsPayload, key: string) => {
    assert.deepEqual(data, payload); assert.equal(key, "stable-key");
    if (++sends === 1) throw new Error("Temporary outage");
    return "provider";
  };
  assert.equal(await deliverAwaitingGarmentsReminder(store, "stable-key", async () => payload, send), "failed");
  assert.equal(await deliverAwaitingGarmentsReminder(store, "stable-key", async () => payload, send), "sent");
});
test("retry stops if garments arrive and does not resend changed batches", async () => {
  const store = new MemoryStore();
  const fail = async () => { throw new Error("Temporary outage"); };
  await deliverAwaitingGarmentsReminder(store, "arrived", async () => payload, fail);
  assert.equal(await deliverAwaitingGarmentsReminder(store, "arrived", async () => null, async () => assert.fail("Should not send")), "skipped");
  await deliverAwaitingGarmentsReminder(store, "changed", async () => payload, fail);
  const changed = { ...payload, email: { ...email, jobs: [email.jobs[0]] } };
  assert.equal(await deliverAwaitingGarmentsReminder(store, "changed", async () => changed, async () => assert.fail("Should not send changed batch")), "review");
});
test("ambiguous delivery outside provider dedupe window is not retried", async () => {
  const store = new MemoryStore();
  await deliverAwaitingGarmentsReminder(store, "old", async () => payload, async () => { throw new Error("Timeout"); }, () => 1_000);
  assert.equal(await deliverAwaitingGarmentsReminder(store, "old", async () => payload, async () => assert.fail("Should not resend"), () => 1_000 + 23 * 60 * 60 * 1_000), "review");
});
test("permanent recipient failures are recorded and not blindly retried", async () => {
  const store = new MemoryStore();
  assert.equal(await deliverAwaitingGarmentsReminder(store, "bad", async () => payload, async () => { throw Object.assign(new Error("Invalid recipient"), { permanent: true }); }), "rejected");
  assert.equal(await deliverAwaitingGarmentsReminder(store, "bad", async () => payload, async () => assert.fail("Should not resend")), "rejected");
});
