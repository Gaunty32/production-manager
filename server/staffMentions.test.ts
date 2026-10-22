import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { resolveSelectedStaffMentions, updateMentionSelections, type MentionSelection } from "../shared/staff-mentions";

const users = [
  { id: "staff-user", firstName: "Chris", lastName: "Staff", email: "staff@example.invalid", active: true, role: "admin" },
  { id: "other-user", firstName: "Chris", lastName: "Other", email: "other@example.invalid", active: true, role: "staff" },
  { id: "admin-user", firstName: "Alex", lastName: "Admin", email: "admin@example.invalid", active: true, role: "super_admin" },
];
const staff = [
  { id: "staff-record", name: "Chris Staff", userId: "staff-user", email: users[0].email, active: true },
  { id: "other-record", name: "Chris Other", userId: "other-user", email: users[1].email, active: true },
];
const message = "Hi @Chris please send the goods";
const selection: MentionSelection = { id: "staff-record", isCustomer: false, start: 3, end: 9, text: "@Chris" };
const resolve = (selections: unknown, text = message, sender = "sender") =>
  resolveSelectedStaffMentions(text, selections, staff, users, sender);

test("typed names and customer selections never notify same-named staff", () => {
  assert.deepEqual(resolve(undefined), []);
  assert.deepEqual(resolve([]), []);
  assert.deepEqual(resolve([{ ...selection, id: "customer-user", isCustomer: true }]), []);
  assert.deepEqual(resolve([{ ...selection, isCustomer: true }]), []);
});

test("picker identity selects exactly one of two staff sharing a first name", () => {
  assert.deepEqual(resolve([selection]).map(u => u.id), ["staff-user"]);
  assert.deepEqual(resolve([{ ...selection, id: "other-record" }]).map(u => u.id), ["other-user"]);
  assert.equal(resolve([selection, selection]).length, 1);
});

test("unknown, malformed, removed, renamed and self mentions cannot send emails", () => {
  for (const input of [{}, [null], [{ ...selection, id: "missing" }], [{ ...selection, start: -1 }]]) {
    assert.deepEqual(resolve(input), []);
  }
  assert.deepEqual(resolve([selection], "Hi @Clare please send the goods"), []);
  assert.deepEqual(resolve([selection], message, "staff-user"), []);
  assert.deepEqual(resolve([selection], message.replace("@Chris", "@Christopher")), []);
});

test("active linked accounts and exact-email fallback only; never guess another Chris", () => {
  assert.equal(resolveSelectedStaffMentions(message, [selection], [{ ...staff[0], active: false }], users, "sender").length, 0);
  assert.equal(resolveSelectedStaffMentions(message, [selection], staff, [{ ...users[0], active: false }], "sender").length, 0);
  assert.equal(resolveSelectedStaffMentions(message, [selection], [{ ...staff[0], userId: null }], users, "sender")[0]?.id, "staff-user");
  assert.equal(resolveSelectedStaffMentions(message, [selection], [{ ...staff[0], userId: null, email: null }], users, "sender").length, 0);
  assert.equal(resolveSelectedStaffMentions("Hi @Alex", [{ ...selection, id: "admin-user", end: 8, text: "@Alex" }], staff, users, "sender")[0]?.id, "admin-user");
});

test("selection positions survive edits outside the name but not deletion/retyping", () => {
  const prefixed = updateMentionSelections(message, `Hello! ${message}`, [selection]);
  assert.equal(resolve(prefixed, `Hello! ${message}`)[0]?.id, "staff-user");
  assert.equal(updateMentionSelections(message, `${message}!`, [selection]).length, 1);
  assert.equal(updateMentionSelections(message, message.replace("@Chris", "@Chri"), [selection]).length, 0);
  const removed = updateMentionSelections(message, "Hi  please send the goods", [selection]);
  assert.equal(updateMentionSelections("Hi  please send the goods", message, removed).length, 0);
  assert.equal(updateMentionSelections(message, message.replace("@Chris", "@Christopher"), [selection]).length, 0);
});

test("trimmed messages and attachment markers retain the correct selected identity", () => {
  const draft = `  ${message}  `;
  const draftSelections = [{ ...selection, start: selection.start + 2, end: selection.end + 2 }];
  const leadingSpace = draft.length - draft.trimStart().length;
  const sentSelections = draftSelections.map(s => ({ ...s, start: s.start - leadingSpace, end: s.end - leadingSpace }));
  assert.equal(resolve(sentSelections, `${draft.trim()}\n[FILE:sample.pdf:example]`)[0]?.id, "staff-user");
});

const routeSource = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
let notifier = "";
const routesWithSelections: string[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "notifyMentionedStaff") notifier = node.getText(routeSource);
  if (ts.isCallExpression(node) && node.expression.getText(routeSource) === "notifyMentionedStaff") {
    assert.equal(node.arguments[5]?.getText(routeSource), "req.body.mentions");
    routesWithSelections.push(node.arguments[4].getText(routeSource));
  }
  ts.forEachChild(node, visit);
}
visit(routeSource);

test("real notification helper requires selections; both chat routes supply them", async () => {
  assert.equal(routesWithSelections.length, 2);
  assert.ok(routesWithSelections.some(url => url.includes("jobId=")));
  assert.ok(routesWithSelections.some(url => url.includes("conversationId=")));
  const emails: any[] = [];
  const context = vm.createContext({
    console, resolveSelectedStaffMentions,
    storage: { getStaff: async () => staff, getAllUsers: async () => users },
    sendMentionNotificationEmail: async (email: any) => { emails.push(email); },
  });
  const compiled = ts.transpileModule(`${notifier}; notifyMentionedStaff;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const notify = vm.runInContext(compiled, context);
  await notify(message, "Sender", "sender", "Order", "/messages", undefined);
  await notify(message, "Sender", "sender", "Order", "/messages", [{ ...selection, isCustomer: true }]);
  assert.equal(emails.length, 0);
  await notify(message, "Sender", "sender", "Order", "/messages", [selection]);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].mentionedEmail, users[0].email);
});

const composerSource = ts.createSourceFile("StaffMessages.tsx", readFileSync(new URL("../client/src/pages/StaffMessages.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const composerFunctions = new Map<string, string>();
function visitComposer(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer
    && ["insertMention", "handleSend", "handleMessageChange"].includes(node.name.getText(composerSource))) {
    composerFunctions.set(node.name.getText(composerSource), node.initializer.getText(composerSource));
  }
  ts.forEachChild(node, visitComposer);
}
visitComposer(composerSource);

function composer(text: string, type = "job", attachments: any[] = []) {
  const payloads: any[] = [];
  const context: any = vm.createContext({
    newMessage: text, selectedMentions: [], selected: { type }, chatImages: attachments, isInternal: false,
    textareaRef: { current: { selectionStart: text.length, focus() {}, setSelectionRange() {} } },
    updateMentionSelections, setTimeout() {}, setShowMentionDropdown() {}, setMentionSearch() {}, setMentionHighlightIdx() {},
    sendJobMessageMutation: { mutate: (p: any) => payloads.push(p), mutateAsync: async (p: any) => { payloads.push(p); } },
    sendDirectMessageMutation: { mutate: (p: any) => payloads.push(p), mutateAsync: async (p: any) => { payloads.push(p); } },
  });
  context.setNewMessage = (value: string) => { context.newMessage = value; };
  context.setSelectedMentions = (value: any) => { context.selectedMentions = typeof value === "function" ? value(context.selectedMentions) : value; };
  context.setChatImages = (value: any) => { context.chatImages = value; };
  const methods: any = {};
  for (const [name, text] of Array.from(composerFunctions)) {
    methods[name] = vm.runInContext(ts.transpileModule(`(${text});`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  }
  return { context, methods, payloads };
}

test("real composer sends no staff selection for plain typed names in either chat", async () => {
  for (const type of ["job", "direct"]) {
    const { methods, payloads } = composer(message, type);
    await methods.handleSend();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].mentions.length, 0);
  }
});

test("real picker retains customer identity even when replacing an identical staff handle", async () => {
  const { context, methods, payloads } = composer("Hi @Chris");
  context.selectedMentions = [selection];
  methods.insertMention({ id: "customer-user", name: "Chris Customer", isCustomer: true });
  await methods.handleSend();
  assert.equal(payloads[0].mentions.length, 1);
  assert.equal(payloads[0].mentions[0].isCustomer, true);
  assert.equal(resolve(payloads[0].mentions, payloads[0].message).length, 0);
});

test("real composer sends selected IDs with trimmed text and only the first image", async () => {
  for (const type of ["job", "direct"]) {
    const { context, methods, payloads } = composer("  Hi @Ch", type, [{ isImage: true, key: "image1" }, { isImage: true, key: "image2" }]);
    methods.insertMention({ id: "other-record", name: "Chris Other", isCustomer: false });
    assert.equal(context.selectedMentions.length, 1);
    await methods.handleSend();
    assert.equal(payloads.length, 2);
    assert.equal(resolve(payloads[0].mentions, payloads[0].message)[0]?.id, "other-user");
    assert.equal(payloads[1].mentions.length, 0);
    assert.equal(context.selectedMentions.length, 0);
  }
});
