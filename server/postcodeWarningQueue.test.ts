import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getOrderPostcodeReview } from "../shared/dpd-shipping-quote";

function functions(file: string, names?: string[]) {
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.filter(ts.isFunctionDeclaration)
    .filter(fn => !names || names.includes(fn.name?.text || ""))
    .map(fn => fn.getText(source).replace(/^export /, "")).join("\n");
}
const queueSource = functions("./postcodeWarningQueue.ts");
const base: any = {
  id: "job", customerId: "customer", jobName: "Test order", jobNumber: 123,
  deliveryAddressType: "customer", packageCount: 1, packageType: "boxes",
};

function queueFixture({ production = true, fail = false } = {}) {
  const rows: any[] = [];
  const sends: any[] = [];
  const jobs = new Map([[base.id, { ...base }]]);
  let failure = fail;
  const context: any = {
    createHash, getOrderPostcodeReview,
    process: { env: { NODE_ENV: production ? "production" : "development" } },
    customers: "customers", jobs: { id: "id" },
    postcodeWarningEmails: { id: "id", jobId: "jobId", sentAt: "sentAt", cancelledAt: "cancelledAt", nextAttemptAt: "nextAttemptAt", queuedAt: "queuedAt" },
    and: (...values: any[]) => values, asc: (v: any) => v, isNull: (v: any) => v,
    lte: (v: any) => v, eq: (field: any, value: any) => ({ field, value }),
    console: { error() {} },
    setInterval: () => ({ unref() {} }),
    sendPostcodeWarningEmail: async (input: any) => {
      sends.push(input);
      if (failure) throw new Error("Temporary provider failure");
    },
  };
  const tx: any = {
    select: () => ({ from: (table: any) => ({ where: (predicate: any) => {
      if (table === "customers") return [{ name: "Test customer", address: "BT1 1AA" }];
      if (table === context.jobs) return [jobs.get(predicate.value)].filter(Boolean);
      return { orderBy: () => ({ limit: () => ({ for: async () => rows
        .filter(row => !row.sentAt && !row.cancelledAt && row.nextAttemptAt <= new Date()).slice(0, 1) }) }) };
    } }) }),
    insert: () => ({ values: (input: any) => ({ onConflictDoNothing: async () => {
      if (!rows.some(row => row.id === input.id)) rows.push({
        ...input, attempts: 0, sentAt: null, cancelledAt: null, nextAttemptAt: new Date(0),
      });
    } }) }),
    update: () => ({ set: (updates: any) => ({ where: async (predicate: any) => {
      Object.assign(rows.find(row => row.id === predicate.value), updates);
    } }) }),
  };
  context.db = { transaction: async (callback: any) => callback(tx) };
  const api = vm.runInNewContext(ts.transpileModule(`${queueSource}
    let running = false;
    ({ queueOrderPostcodeWarning, processPostcodeWarningEmails, postcodeWarningId })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return { ...api, tx, rows, sends, jobs, recover: () => { failure = false; } };
}

test("postcode review uses the actual delivery address for every parcel count", () => {
  for (const packageCount of [1, 2, 4, 5, 12]) {
    const review = getOrderPostcodeReview({ ...base, packageCount, deliveryAddressType: "custom", deliveryAddress: "End customer\nBT1 1AA" } as any, "LS13 3HE");
    assert.equal(review?.postcode, "BT1 1AA");
    assert.match(review?.warning || "", /higher destination tariff/);
  }
  assert.equal(getOrderPostcodeReview({ ...base, dispatchPostcode: "IV1 1AA" }, "LS13 3HE")?.postcode, "IV1 1AA");
  assert.equal(getOrderPostcodeReview({ ...base, deliveryAddressType: "custom", deliveryAddress: "No postcode" }, "LS13 3HE")?.valid, false);
  assert.equal(getOrderPostcodeReview({ ...base, shippingMethod: "customer_collection" }, "BT1 1AA"), null);
});

test("warning emails are durably queued once for each saved order and destination", async () => {
  const fixture = queueFixture();
  for (let i = 0; i < 3; i++) await fixture.queueOrderPostcodeWarning(fixture.tx, base);
  assert.equal(fixture.rows.length, 1);
  assert.equal(fixture.rows[0].postcode, "BT1 1AA");
  assert.equal(fixture.sends.length, 0, "Saving only queues; it never sends inline");
  await fixture.processPostcodeWarningEmails();
  assert.equal(fixture.sends.length, 1);
  assert.ok(fixture.rows[0].sentAt);
  await fixture.processPostcodeWarningEmails();
  assert.equal(fixture.sends.length, 1, "Page reopens, retries and repeat saves cannot re-email an accepted warning");
});

test("a safe postcode creates no surcharge email; changed risky postcodes create a new event", async () => {
  const fixture = queueFixture();
  await fixture.queueOrderPostcodeWarning(fixture.tx, { ...base, dispatchPostcode: "LS13 3HE" });
  assert.equal(fixture.rows.length, 0);
  await fixture.queueOrderPostcodeWarning(fixture.tx, base);
  await fixture.queueOrderPostcodeWarning(fixture.tx, { ...base, dispatchPostcode: "IV1 1AA" });
  assert.equal(fixture.rows.length, 2);
  assert.notEqual(fixture.rows[0].id, fixture.rows[1].id);
});

test("temporary email errors retain the queue and retry with the same provider idempotency key", async () => {
  const fixture = queueFixture({ fail: true });
  await fixture.queueOrderPostcodeWarning(fixture.tx, base);
  await fixture.processPostcodeWarningEmails();
  assert.equal(fixture.rows[0].sentAt, null);
  assert.equal(fixture.rows[0].attempts, 1);
  assert.ok(fixture.rows[0].nextAttemptAt > new Date());
  await fixture.processPostcodeWarningEmails();
  assert.equal(fixture.sends.length, 1, "Backoff avoids repeated sends during a provider failure");
  fixture.recover();
  fixture.rows[0].nextAttemptAt = new Date(0);
  await fixture.processPostcodeWarningEmails();
  assert.equal(fixture.sends.length, 2);
  assert.equal(fixture.sends[0].idempotencyKey, fixture.sends[1].idempotencyKey);
  assert.ok(fixture.rows[0].sentAt);
});

test("development never sends warning emails and corrected destinations cancel obsolete queued warnings", async () => {
  const dev = queueFixture({ production: false });
  await dev.queueOrderPostcodeWarning(dev.tx, base);
  await dev.processPostcodeWarningEmails();
  assert.equal(dev.sends.length, 0);
  const fixture = queueFixture();
  await fixture.queueOrderPostcodeWarning(fixture.tx, base);
  fixture.jobs.set(base.id, { ...base, dispatchPostcode: "LS13 3HE" });
  await fixture.processPostcodeWarningEmails();
  assert.equal(fixture.sends.length, 0);
  assert.ok(fixture.rows[0].cancelledAt);
});

test("the email uses exactly the requested recipients, escaped content and the saved idempotency key", async () => {
  const calls: any[] = [];
  const source = functions("./emailService.ts", ["sendPostcodeWarningEmail", "sanitizeHtml"]);
  const sender = vm.runInNewContext(ts.transpileModule(`${source}; sendPostcodeWarningEmail;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    getUncachableResendClient: async () => ({ client: {}, fromEmail: "test@example.invalid" }),
    sendEmail: async (_client: any, params: any, options: any) => { calls.push({ params, options }); return { error: null }; },
    brandedEmail: (body: string) => body,
    infoTable: (rows: any[]) => rows.map(row => `${row.label}: ${row.value}`).join("\n"),
  });
  await sender({
    jobId: "job", jobNumber: 123, jobName: "<script>bad</script>", customerName: "<b>Test</b>",
    postcode: "BT1 1AA", warning: "Higher tariff & check", idempotencyKey: "stable-alert-key",
  });
  assert.deepEqual(Array.from(calls[0].params.to), ["chris@selectbranding.co.uk", "james@selectbranding.co.uk"]);
  assert.equal(calls[0].options.idempotencyKey, "stable-alert-key");
  assert.ok(calls[0].params.html.includes("&lt;script&gt;"));
  assert.ok(!calls[0].params.html.includes("<script>"));
});
