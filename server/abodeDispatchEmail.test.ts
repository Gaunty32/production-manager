import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("emailService.ts", readFileSync(new URL("./emailService.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const functions = ["sanitizeHtml", "sendAbodeDispatchEmail"].map(name => {
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn);
  return fn.getText(source).replace(/^export /, "");
}).join("\n");

test("Abode receives a branded, per-order despatch email with truthful optional tracking", async () => {
  const sent: any[] = [];
  let failed = false;
  const context = vm.createContext({
    getUncachableResendClient: async () => ({ client: {}, fromEmail: "sender@example.invalid" }),
    brandedEmail: (body: string, branding: unknown) => { assert.ok(branding); return body; },
    ctaButton: (url: string, label: string) => `<a href="${url}">${label}</a>`,
    muted: (text: string) => `<p>${text}</p>`,
    sendEmail: async (_client: unknown, email: unknown, options: unknown) => {
      sent.push({ email, options }); return failed ? { error: { message: "temporary error" } } : {};
    },
  });
  const send = vm.runInContext(ts.transpileModule(`${functions}\nsendAbodeDispatchEmail;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const details = {
    customerName: "Abode Home & Gifts", customerFirstName: "Abode", orderNumber: "88428981",
    trackingNumber: "6895387834", carrier: "DPD Local", trackingUrl: "https://carrier.example.invalid/6895387834",
    portalUrl: "https://example.invalid/customer/stockings", idempotencyKey: "fixture-idempotency-key",
  };
  await send("abode@example.invalid", details);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].email.to)), ["abode@example.invalid"]);
  assert.match(sent[0].email.subject, /88428981.*despatched/);
  assert.match(sent[0].email.html, /6895387834/);
  assert.match(sent[0].email.html, /Track this order/);
  assert.doesNotMatch(sent[0].email.html, /completed|has been delivered/i);
  assert.equal(sent[0].options.idempotencyKey, details.idempotencyKey);
  await send("abode@example.invalid", { ...details, orderNumber: '<script>alert("x")</script>', trackingNumber: null, trackingUrl: null });
  assert.match(sent[1].email.html, /tracking number is not currently available/);
  assert.doesNotMatch(sent[1].email.html, /Track this order|<script>/);
  failed = true;
  await assert.rejects(() => send("abode@example.invalid", details), /temporary error/);
});
