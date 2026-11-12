import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("emailService.ts", readFileSync(new URL("./emailService.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const names = ["sanitizeHtml", "brandedEmail", "sendTeamInviteEmail"];
const functions = names.map(name => {
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `${name} must exist`);
  return fn.getText(source).replace(/^export /, "");
}).join("\n");

function harness() {
  let message: any;
  const context = vm.createContext({
    URL, console,
    getBaseUrl: () => "https://example.invalid",
    getUncachableResendClient: async () => ({ client: {}, fromEmail: "sender@example.invalid" }),
    ctaButton: (url: string, label: string) => `<a href="${url}">${label}</a>`,
    divider: "<hr/>",
    muted: (text: string) => `<p>${text}</p>`,
    sendEmail: async (_client: unknown, email: unknown) => { message = email; return {}; },
  });
  const compiled = ts.transpileModule(`${functions}\n({ brandedEmail, sendTeamInviteEmail });`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return { ...vm.runInContext(compiled, context), message: () => message };
}

test("portal invitations and resets include both logos without sending real email", async () => {
  for (const isReset of [false, true]) {
    const email = harness();
    await email.sendTeamInviteEmail("test@example.invalid", {
      firstName: "Test", inviterName: "Select Branding", companyName: 'Customer "A" & Co',
      customerLogoUrl: "/api/img/uploads/customer-logo",
      inviteUrl: "https://example.invalid/customer/invite?token=fixture", isReset,
    });
    const message = email.message();
    assert.match(message.html, /src="https:\/\/example.invalid\/logo.png"/);
    assert.match(message.html, /src="https:\/\/example.invalid\/api\/img\/uploads\/customer-logo"/);
    assert.match(message.html, /alt="Customer &quot;A&quot; &amp; Co"/);
    assert.match(message.html, isReset ? /Reset Password/ : /Accept Invitation/);
    assert.match(message.html, /48 hours/);
    assert.match(message.html, /width:100%;max-width:160px/);
  }
});

test("missing or unsafe customer logos keep the original single-logo header", () => {
  const email = harness();
  for (const customerLogoUrl of [null, "", "javascript:alert(1)", "//untrusted.invalid/logo"]) {
    const html = email.brandedEmail("Body", { customerLogoUrl });
    assert.equal((html.match(/<img /g) || []).length, 1);
    assert.doesNotMatch(html, /Dual-logo/);
  }
  const html = email.brandedEmail("Body", { customerLogoUrl: "https://cdn.example.invalid/logo.png?a=1&b=2" });
  assert.match(html, /https:\/\/cdn.example.invalid\/logo.png\?a=1&amp;b=2/);
});

test("every invitation and reset entry point passes the customer's saved logo", () => {
  const routes = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let calls = 0;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(routes) === "sendTeamInviteEmail") {
      calls++;
      const details = node.arguments[1];
      assert.ok(ts.isObjectLiteralExpression(details));
      assert.ok(details.properties.some(prop => ts.isPropertyAssignment(prop) && prop.name.getText(routes) === "customerLogoUrl"));
    }
    ts.forEachChild(node, visit);
  }
  visit(routes);
  assert.equal(calls, 6);
});
