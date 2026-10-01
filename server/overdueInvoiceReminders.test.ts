import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverdueInvoice, overdueReminderWeek, parseXeroInvoiceDate } from "./overdueInvoiceRules";
import {
  deliverOverdueReminder, type ReminderPayload, type ReminderState, type ReminderStore,
} from "./overdueReminderDelivery";
import { buildOverdueInvoiceReminderEmail } from "./emailService";
import { XeroService } from "./xero";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-05T07:00:00Z");
const invoice = { Type: "ACCREC", Status: "AUTHORISED", AmountDue: 50, Date: "2026-08-01" };
const sampleEmail = {
  to: ["billing@example.test"], customerName: "Example & Co", customerFirstName: "Example",
  invoices: [{ invoiceNumber: "INV-001", date: "2026-08-01", amountDue: 50, currencyCode: "GBP" }],
};
const payload: ReminderPayload = {
  email: sampleEmail, rendered: { subject: "Reminder", html: "<p>Frozen</p>", text: "Frozen" },
};

class MemoryStore implements ReminderStore {
  rows = new Map<string, ReminderState>();
  private tail: Promise<unknown> = Promise.resolve();
  mutate<T>(key: string, update: (state: ReminderState | null) => { state: ReminderState; result: T }): Promise<T> {
    const operation = this.tail.then(() => {
      const result = update(this.rows.get(key) || null);
      this.rows.set(key, structuredClone(result.state));
      return result.result;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}

test("overdue uses invoice age >30 days, unpaid status and ACCREC only", () => {
  assert.ok(isOverdueInvoice(invoice, now));
  for (const Status of ["PAID", "VOIDED", "DRAFT", "DELETED"]) {
    assert.equal(isOverdueInvoice({ ...invoice, Status }, now), false);
  }
  for (const AmountDue of [0, -5, NaN, Infinity]) {
    assert.equal(isOverdueInvoice({ ...invoice, AmountDue }, now), false);
  }
  assert.equal(isOverdueInvoice({ ...invoice, Type: "ACCPAY" }, now), false);
  assert.equal(isOverdueInvoice({ ...invoice, Date: new Date(now - 30 * DAY).toISOString() }, now), false);
  assert.ok(isOverdueInvoice({ ...invoice, Date: new Date(now - 30 * DAY - 1).toISOString() }, now));
  assert.equal(isOverdueInvoice({ ...invoice, Date: "bad date" }, now), false);
  assert.ok(isOverdueInvoice({ ...invoice, Status: "SUBMITTED" }, now));
});

test("legacy Xero dates retain milliseconds and match ISO eligibility", () => {
  const timestamp = Date.parse("2026-08-01T12:34:56Z");
  for (const offset of ["", "+0100", "-0500"]) {
    assert.equal(parseXeroInvoiceDate(`/Date(${timestamp}${offset})/`), timestamp);
    assert.ok(isOverdueInvoice({ ...invoice, Date: `/Date(${timestamp}${offset})/` }, now));
  }
});

test("Mondays at 08:00 UK follows summer/winter clocks and catches up through Sunday", () => {
  assert.equal(overdueReminderWeek(new Date("2026-07-06T06:59:59Z")), null);
  assert.equal(overdueReminderWeek(new Date("2026-07-06T07:00:00Z")), "2026-07-06");
  assert.equal(overdueReminderWeek(new Date("2026-12-07T07:59:59Z")), null);
  assert.equal(overdueReminderWeek(new Date("2026-12-07T08:00:00Z")), "2026-12-07");
  assert.equal(overdueReminderWeek(new Date("2026-10-01T12:00:00Z")), "2026-09-28");
  assert.equal(overdueReminderWeek(new Date("2026-10-25T12:00:00Z")), "2026-10-19");
  assert.equal(overdueReminderWeek(new Date("2026-10-26T07:59:59Z")), null);
  assert.equal(overdueReminderWeek(new Date("2026-10-26T08:00:00Z")), "2026-10-26");
});

test("one email per week despite overlapping runs and a restart", async () => {
  const store = new MemoryStore();
  let sends = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const send = async () => { sends++; await gate; return "mock-id"; };
  const first = deliverOverdueReminder(store, "week-customer", async () => payload, send, () => now);
  // Let the first call claim the row before launching the overlapping instance.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await deliverOverdueReminder(store, "week-customer", async () => payload, send, () => now), "busy");
  release();
  assert.equal(await first, "sent");
  assert.equal(await deliverOverdueReminder(store, "week-customer", async () => payload, send, () => now), "sent");
  assert.equal(sends, 1);
  assert.equal(store.rows.get("week-customer")?.providerId, "mock-id");
  assert.equal(await deliverOverdueReminder(store, "next-week-customer", async () => payload, send, () => now), "sent");
  assert.equal(sends, 2);
});

test("failure does not mark sent; retry reuses frozen content and stable key", async () => {
  const store = new MemoryStore();
  const keys: string[] = [];
  assert.equal(await deliverOverdueReminder(store, "retry", async () => payload, async (_p, key) => {
    keys.push(key); throw new Error("Temporary provider failure");
  }, () => now), "failed");
  assert.equal(store.rows.get("retry")?.sentAt, undefined);
  assert.equal(await deliverOverdueReminder(store, "retry",
    async () => ({ ...payload, rendered: { ...payload.rendered, html: "New template" } }),
    async (p, key) => {
      assert.equal(p.rendered.html, payload.rendered.html);
      keys.push(key); return "accepted";
    }, () => now + 900000), "sent");
  assert.deepEqual(keys, ["retry", "retry"]);
});

test("paid invoices or changed balances/addresses cancel a frozen retry", async () => {
  for (const fresh of [null, {
    ...payload, email: { ...sampleEmail, invoices: [{ ...sampleEmail.invoices[0], amountDue: 20 }] },
  }, { ...payload, email: { ...sampleEmail, to: ["different@example.test"] } }]) {
    const store = new MemoryStore();
    store.rows.set("changed", { status: "failed", payload, firstAttemptAt: now });
    assert.equal(await deliverOverdueReminder(store, "changed", async () => fresh, async () => {
      assert.fail("Must not resend stale financial data");
    }, () => now + 60000), "skipped");
  }
});

test("expired ambiguous deliveries need review; stale lease inside dedupe window recovers", async () => {
  const store = new MemoryStore();
  store.rows.set("old", { status: "sending", payload, firstAttemptAt: now - 24 * 60 * 60 * 1000, leaseUntil: now - 1 });
  assert.equal(await deliverOverdueReminder(store, "old", async () => payload, async () => {
    assert.fail("Expired provider deduplication must not cause duplicate emails");
  }, () => now), "review");
  store.rows.set("recover", { status: "sending", owner: "dead-process", payload, firstAttemptAt: now - 900000, leaseUntil: now - 1 });
  assert.equal(await deliverOverdueReminder(store, "recover", async () => payload, async () => "recovered", () => now), "sent");
});

test("no debt skips delivery; failed lookups retry; permanent rejection is terminal", async () => {
  const store = new MemoryStore();
  const neverSend = async (): Promise<string> => { assert.fail("Must not send"); };
  assert.equal(await deliverOverdueReminder(store, "empty", async () => null, neverSend), "skipped");
  assert.equal(await deliverOverdueReminder(store, "lookup", async () => { throw new Error("Xero unavailable"); }, neverSend), "failed");
  assert.equal(store.rows.get("lookup")?.firstAttemptAt, undefined);
  assert.equal(await deliverOverdueReminder(store, "rejected", async () => payload, async () => {
    throw Object.assign(new Error("Invalid recipient"), { permanent: true });
  }), "rejected");
  assert.equal(await deliverOverdueReminder(store, "rejected", async () => payload, neverSend), "rejected");
});

test("template contains requested warning, escapes HTML, and separates currency totals", () => {
  const message = buildOverdueInvoiceReminderEmail({
    ...sampleEmail, customerName: "<script>alert(1)</script>", customerFirstName: "<img onerror=alert(1)>",
    invoices: [
      { invoiceNumber: "<b>INV-001</b>", date: "/Date(1785542400000+0100)/", amountDue: 50, currencyCode: "GBP" },
      { invoiceNumber: "INV-002", date: "2026-08-02", amountDue: 10, currencyCode: "EUR" },
    ],
  });
  assert.ok(message.html.includes("&lt;b&gt;INV-001&lt;/b&gt;"));
  assert.ok(!message.html.includes("<script>alert"));
  assert.ok(!message.html.includes("<img onerror"));
  assert.match(message.text, /GBP: £50\.00/);
  assert.match(message.text, /EUR: €10\.00/);
  assert.ok(message.text.includes("1 August 2026"));
  assert.ok(message.text.includes("If payment is not received by return, any future orders will need to be paid for at the time they are submitted to the portal."));
});

function fakeXero(responses: Array<{ status?: number; body: unknown }>) {
  const service = new XeroService();
  const urls: string[] = [];
  const internal = service as any;
  internal.getAccessToken = async () => "fake-test-token";
  internal.getTenantId = () => "fake-test-tenant";
  internal.reminderApiRequest = async (url: string) => {
    urls.push(url);
    const next = responses.shift();
    assert.ok(next, "Unexpected request");
    return new Response(JSON.stringify(next.body), { status: next.status || 200 });
  };
  return { service, urls };
}

test("Xero stored contact failures never fall through to fuzzy matches", async () => {
  const { service, urls } = fakeXero([{ status: 404, body: {} }]);
  await assert.rejects(service.findContactForReminder({ name: "Example", xeroContactId: "stored" } as any), /HTTP 404/);
  assert.equal(urls.length, 1);
});

test("Xero rejects ambiguous contacts, allows exact email and skips fuzzy matches", async () => {
  const ambiguous = fakeXero([{ body: { Contacts: [
    { ContactID: "one", Name: "Example" }, { ContactID: "two", Name: "Example" },
  ] } }]);
  await assert.rejects(ambiguous.service.findContactForReminder({ name: "Example" } as any), /More than one/);
  const email = fakeXero([
    { body: { Contacts: [] } },
    { body: { Contacts: [{ ContactID: "email", Name: "Company", EmailAddress: "billing@example.test" }] } },
  ]);
  assert.equal((await email.service.findContactForReminder({ name: "Example", email: "billing@example.test" } as any))?.contactID, "email");
  const fuzzy = fakeXero([{ body: { Contacts: [{ ContactID: "wrong", Name: "Example Other" }] } }]);
  assert.equal(await fuzzy.service.findContactForReminder({ name: "Example" } as any), null);
});

const rawInvoice = {
  ...invoice, InvoiceID: "id", InvoiceNumber: "INV-001", Total: 50, CurrencyCode: "GBP", DueDate: "2026-08-31",
};

test("Xero fetches all pages, preserves raw dates and fails closed on partial fetches", async () => {
  const fullPage = Array.from({ length: 100 }, (_, i) => ({
    ...rawInvoice, InvoiceID: `id-${i}`, InvoiceNumber: `INV-${i}`,
  }));
  const paginated = fakeXero([
    { body: { Invoices: fullPage } },
    { body: { Invoices: [{ ...rawInvoice, InvoiceID: "last", Date: "/Date(1785542400000+0100)/" }] } },
  ]);
  const all = await paginated.service.getInvoicesForReminder("00000000-0000-0000-0000-000000000001");
  assert.equal(all.length, 101);
  assert.equal(all[100].Date, "/Date(1785542400000+0100)/");
  assert.ok(paginated.urls[1].includes("page=2"));
  const failed = fakeXero([{ body: { Invoices: fullPage } }, { status: 429, body: {} }]);
  await assert.rejects(failed.service.getInvoicesForReminder("contact"), /HTTP 429/);
  const malformed = fakeXero([{ body: { Invoices: [{ ...rawInvoice, AmountDue: "50" }] } }]);
  await assert.rejects(malformed.service.getInvoicesForReminder("contact"), /malformed/);
});