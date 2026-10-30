import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { staffJobPath, staffJobSignInDestination } from "../shared/staff-job-links";

test("job links use the real staff job route and encode the identifier", () => {
  assert.equal(staffJobPath("test-job"), "/staff/job/test-job");
  assert.equal(staffJobPath("job?other=1"), "/staff/job/job%3Fother%3D1");
});

test("both old and current email destinations survive sign-in", () => {
  for (const path of ["/jobs/test-job", "/staff/job/test-job"]) {
    assert.equal(staffJobSignInDestination(path), path);
    assert.equal(staffJobSignInDestination(path, "?source=email", "#files"), `${path}?source=email#files`);
  }
});

test("ordinary sign-ins keep the existing home destination and cannot redirect externally", () => {
  for (const path of ["/", "/staff-login", "/customer/login", "/orders", "//example.invalid/jobs/123", "https://example.invalid/jobs/123", "/jobs/a/b", "/jobs/"]) {
    assert.equal(staffJobSignInDestination(path), "/");
  }
});

test("the real print notification generates a working View Job URL without sending an email", async () => {
  const source = ts.createSourceFile("emailService.ts", readFileSync(new URL("./emailService.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "sendNewPrintJobEmail");
  assert.ok(fn);
  let message: any;
  const context = vm.createContext({
    staffJobPath, getBaseUrl: () => "https://example.invalid",
    getUncachableResendClient: async () => ({ client: {}, fromEmail: "sender@example.invalid" }),
    sanitizeHtml: (text: string) => text,
    infoTable: () => "", ctaButton: (url: string, label: string) => `<a href="${url}">${label}</a>`,
    brandedEmail: (html: string) => html,
    sendEmail: async (_client: unknown, email: unknown) => { message = email; return {}; },
    console,
  });
  const compiled = ts.transpileModule(`${fn.getText(source).replace(/^export /, "")}\nsendNewPrintJobEmail;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const send = vm.runInContext(compiled, context);
  await send({ customerName: "Test customer", jobName: "Test print", jobId: "test-job" });
  assert.ok(message.html.includes('href="https://example.invalid/staff/job/test-job"'));
  assert.equal(message.html.includes("https://example.invalid/jobs/"), false);
});

test("old email routes redirect and both staff sign-in callbacks preserve the destination", () => {
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../client/src/pages/StaffLogin.tsx", import.meta.url), "utf8");
  assert.ok(app.includes('<Route path="/jobs/:id">{params => <Redirect to={staffJobPath(params.id)} />}</Route>'));
  assert.equal((login.match(/window\.location\.href = staffJobSignInDestination\(/g) || []).length, 2);
});
