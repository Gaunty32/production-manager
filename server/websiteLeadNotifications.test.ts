import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build, transform } from "esbuild";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

// Bundle only the sender with a fake SDK/key: no real credentials or network.
const bundlePath = resolve(`.local/website-lead-test-${randomUUID()}.mjs`);
const sendSymbol = Symbol.for("website-lead-test-send");
await build({
  entryPoints: ["server/emailService.ts"], outfile: bundlePath, bundle: true,
  platform: "node", format: "esm", packages: "external",
  define: { "process.env.RESEND_API_KEY": '"fixture-key-not-a-credential"' },
  plugins: [{
    name: "fake-email-provider",
    setup(builder) {
      builder.onResolve({ filter: /^resend$/ }, () => ({ path: "resend", namespace: "fake-provider" }));
      builder.onLoad({ filter: /.*/, namespace: "fake-provider" }, () => ({
        contents: `export class Resend {
          emails = { send: (params, options) =>
            globalThis[Symbol.for("website-lead-test-send")](params, options) };
        }`,
      }));
    },
  }],
});
const emailService = await import(pathToFileURL(bundlePath).href) as typeof import("./emailService");
after(async () => {
  delete (globalThis as any)[sendSymbol];
  await unlink(bundlePath);
});

const demo = {
  kind: "demo" as const, firstName: "Example", lastName: "Customer", email: "lead@example.test",
  phone: "07700 900123", company: "Example & Co",
};
const callback = {
  kind: "callback" as const, submittedPhone: "020 7946 0018", normalizedPhone: "+442079460018",
  pageUrl: "https://example.test/demo-access?utm_campaign=autumn", available: false,
  attribution: { utmSource: "newsletter", utmMedium: "email", utmCampaign: "autumn", utmTerm: null, utmContent: null },
  requestId: "fixture-request",
};

test("demo email goes to info with every submitted field and prospect reply-to", async () => {
  let envelope: any;
  (globalThis as any)[sendSymbol] = async (params: any) => {
    envelope = params;
    return { data: { id: "fixture-email-id" }, error: null };
  };
  await emailService.sendWebsiteLeadNotification(demo);
  assert.equal(envelope.to, "info@selectbranding.co.uk");
  assert.equal(envelope.replyTo, demo.email);
  for (const value of [demo.firstName, demo.lastName, demo.email, demo.phone, demo.company]) {
    assert.ok(envelope.text.includes(value));
  }
  assert.ok(envelope.html.includes("Example &amp; Co"));
});

test("callback email includes number, page, attribution and stable request key", async () => {
  let envelope: any;
  let options: any;
  (globalThis as any)[sendSymbol] = async (params: any, sendOptions: any) => {
    envelope = params; options = sendOptions;
    return { data: { id: "fixture-email-id" }, error: null };
  };
  await emailService.sendWebsiteLeadNotification(callback);
  assert.equal(envelope.to, "info@selectbranding.co.uk");
  assert.equal(envelope.replyTo, "info@selectbranding.co.uk");
  for (const value of [callback.submittedPhone, callback.normalizedPhone, callback.pageUrl, "newsletter", "email", "autumn", "Outside callback hours"]) {
    assert.ok(envelope.text.includes(value));
  }
  assert.equal(options.idempotencyKey, "website-callback-fixture-request");
});

test("existing demo prospect email and Chris/James copies remain unchanged", async () => {
  let envelope: any;
  (globalThis as any)[sendSymbol] = async (params: any) => {
    envelope = params;
    return { data: { id: "fixture-email-id" }, error: null };
  };
  await emailService.sendDemoAccessEmail({ ...demo, portalUrl: "https://example.test/portal-preview" });
  assert.equal(envelope.to, demo.email);
  assert.deepEqual(envelope.cc, ["chris@selectbranding.co.uk", "james@selectuniforms.co.uk"]);
});

test("provider errors and missing acceptance IDs fail explicitly", async () => {
  for (const result of [
    { data: null, error: { message: "Fixture provider rejection" } },
    { data: {}, error: null },
  ]) {
    (globalThis as any)[sendSymbol] = async () => result;
    await assert.rejects(emailService.sendWebsiteLeadNotification(demo), /Failed to send website enquiry notification/);
  }
});

test("untrusted form content is escaped and cannot inject subject headers", () => {
  const email = emailService.buildWebsiteLeadNotificationEmail({
    ...demo, firstName: "<script>alert(1)</script>\r\nBcc: unwanted@example.test",
    company: '<img src=x onerror="alert(1)">',
  });
  assert.ok(!email.html.includes("<script>"));
  assert.ok(!email.html.includes('<img src=x'));
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(!/[\r\n]/.test(email.subject));
  assert.equal(email.to, "info@selectbranding.co.uk");
});

// Exercise the actual narrowly selected route bodies with all effects mocked.
// Transpilation avoids loading the large route registry or touching live data.
const routeSource = await readFile("server/routes.ts", "utf8");
async function handlerFixture(kind: "demo" | "callback", options: { emailFails?: boolean; highlevelFails?: boolean; rateLimited?: boolean } = {}) {
  const marker = kind === "demo" ? '  app.post("/api/demo/request-access"' : '  app.post("/api/callback"';
  const endMarker = kind === "demo" ? "  // Staff authentication routes" : "  // Serve object storage files";
  const start = routeSource.indexOf(marker);
  const end = routeSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "Route fixture markers must exist");
  const transformed = await transform(routeSource.slice(start, end), { loader: "ts", target: "node20" });
  let handler!: (req: any, res: any) => Promise<void>;
  const notifications: any[] = [];
  const prospectEmails: any[] = [];
  const highlevel: any[] = [];
  const dbChanges: any[] = [];
  const fakeDeps: Record<string, any> = {
    app: { post: (_path: string, routeHandler: typeof handler) => { handler = routeHandler; } },
    z, crypto, parsePhoneNumberFromString,
    process: { env: {
      SESSION_SECRET: "fixture-hash-key", HIGHLEVEL_API_TOKEN2: "fixture-token",
      HIGHLEVEL_LOCATION_ID2: "fixture-location", HIGHLEVEL_CALLBACK_WORKFLOW_ID2: "fixture-workflow",
    } },
    console: { error() {}, info() {}, log() {} },
    db: {
      insert: () => ({ values: () => ({ returning: async () => [{ id: "fixture-request" }] }) }),
      select: () => ({ from: () => ({ where: async () => [{ count: options.rateLimited ? 10 : 1 }] }) }),
      update: () => ({ set: (values: any) => ({ where: async () => { dbChanges.push(values); } }) }),
    },
    callbackRequests: {},
    eq() {}, and() {}, gte() {}, ne() {}, drizzleSql() {},
    getCallbackAvailability: () => ({ available: true }),
    sendWebsiteLeadNotification: async (params: any) => {
      notifications.push(params);
      if (options.emailFails) throw new Error("Fixture email failure");
    },
    fetch: async (url: string, init: any) => {
      highlevel.push({ url, body: JSON.parse(init.body) });
      if (options.highlevelFails) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify(highlevel.length === 1 ? { contact: { id: "fixture-contact" } } : {}));
    },
    storage: { getUserByEmail: async () => ({ id: "fixture-demo", role: "demo", active: true }) },
    sendDemoAccessEmail: async (params: any) => { prospectEmails.push(params); },
    MARKETING_BASE_URL: "https://example.test",
  };
  const names = Object.keys(fakeDeps);
  new Function(...names, transformed.code)(...names.map(name => fakeDeps[name]));
  assert.ok(handler);
  const invoke = async (body: any) => {
    const response = { code: 200, body: null as any };
    const res = {
      status(code: number) { response.code = code; return this; },
      json(value: any) { response.body = value; return this; },
    };
    await handler({ body, ip: "127.0.0.1", protocol: "https", get: () => "example.test" }, res);
    return response;
  };
  return { invoke, notifications, prospectEmails, highlevel, dbChanges };
}

test("demo route notifies info and keeps the existing prospect email", async () => {
  const fixture = await handlerFixture("demo");
  const result = await fixture.invoke(demo);
  assert.equal(result.code, 200);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].phone, demo.phone);
  assert.equal(fixture.notifications[0].kind, "demo");
  assert.equal(fixture.prospectEmails.length, 1);
  assert.equal(fixture.prospectEmails[0].email, demo.email);
});

test("demo route does not falsely report success if the inbox email fails", async () => {
  const fixture = await handlerFixture("demo", { emailFails: true });
  const result = await fixture.invoke(demo);
  assert.equal(result.code, 500);
  assert.equal(fixture.prospectEmails.length, 0);
});

test("callback route emails the details and still performs both HighLevel steps", async () => {
  const fixture = await handlerFixture("callback");
  const result = await fixture.invoke({ phone: callback.submittedPhone, page: callback.pageUrl });
  assert.equal(result.code, 200);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].normalizedPhone, callback.normalizedPhone);
  assert.equal(fixture.notifications[0].attribution.utmCampaign, "autumn");
  assert.equal(fixture.highlevel.length, 2);
  assert.equal(fixture.highlevel[0].body.phone, callback.normalizedPhone);
  assert.equal(fixture.dbChanges.at(-1)?.status, "workflow_enrolled");
});

test("callback inbox failure is explicit but does not block HighLevel", async () => {
  const fixture = await handlerFixture("callback", { emailFails: true });
  const result = await fixture.invoke({ phone: callback.submittedPhone });
  assert.equal(result.code, 502);
  assert.match(result.body.error, /callback has been requested.*email notification could not be sent/);
  assert.equal(fixture.highlevel.length, 2);
});

test("callback still emails the lead if HighLevel fails", async () => {
  const fixture = await handlerFixture("callback", { highlevelFails: true });
  const result = await fixture.invoke({ phone: callback.submittedPhone });
  assert.equal(result.code, 502);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.highlevel.length, 1);
});

test("callback honeypots and invalid numbers do not email or start callbacks", async () => {
  for (const body of [
    { phone: callback.submittedPhone, website: "bot-filled-field" },
    { phone: "invalid-number" },
  ]) {
    const fixture = await handlerFixture("callback");
    await fixture.invoke(body);
    assert.equal(fixture.notifications.length, 0);
    assert.equal(fixture.highlevel.length, 0);
  }
});

test("rate-limited callback submissions cannot flood the inbox", async () => {
  const fixture = await handlerFixture("callback", { rateLimited: true });
  const result = await fixture.invoke({ phone: callback.submittedPhone });
  assert.equal(result.code, 429);
  assert.equal(fixture.notifications.length, 0);
  assert.equal(fixture.highlevel.length, 0);
});