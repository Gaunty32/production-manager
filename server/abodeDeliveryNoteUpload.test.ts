import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadAbodeDeliveryNote } from "../client/src/lib/abodeDeliveryNoteUpload";

const pdf = () => new File(["%PDF-1.7\noriginal pages\n%%EOF"], "dispatch-note-12345678.pdf", { type: "application/pdf" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const options = { baseUrl: "/api/abode", isStaff: true, jobId: "job-id" };

test("direct PDF upload stays browser-to-storage when it works", async () => {
  const calls: string[] = [];
  const key = await uploadAbodeDeliveryNote(pdf(), options, async (url, init) => {
    calls.push(String(url));
    if (calls.length === 1) return json({ url: "https://storage.example.test/object", key: "/objects/uploads/direct" });
    assert.equal(init?.method, "PUT");
    assert.equal(init?.credentials, "omit", "Never send app credentials to the storage host");
    return new Response(null, { status: 200 });
  });
  assert.equal(key, "/objects/uploads/direct");
  assert.equal(calls.length, 2);
});

for (const isStaff of [true, false]) {
  test(`${isStaff ? "staff" : "customer"} PDFs use a same-origin backup after browser network/CORS failure`, async () => {
    const baseUrl = isStaff ? "/api/abode" : "/api/customer-portal/abode";
    const calls: string[] = [];
    const file = pdf();
    const key = await uploadAbodeDeliveryNote(file, { ...options, baseUrl, isStaff }, async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) {
        assert.equal(String(url), isStaff ? "/api/staff/objects/upload" : "/api/customer-portal/objects/upload");
        return json({ url: "https://storage.example.test/object", key: "/objects/uploads/direct" });
      }
      if (calls.length === 2) throw new TypeError("Failed to fetch");
      assert.equal(String(url), `${baseUrl}/delivery-notes/upload`);
      assert.equal(init?.credentials, "include");
      assert.equal((init?.headers as Record<string, string>)["x-job-id"], "job-id");
      assert.equal(init?.body, file);
      return json({ key: "/objects/uploads/backup" });
    });
    assert.equal(key, "/objects/uploads/backup");
    assert.equal(calls.length, 3);
  });
}

test("storage HTTP rejection also uses the backup without attaching twice", async () => {
  let calls = 0;
  assert.equal(await uploadAbodeDeliveryNote(pdf(), options, async () => {
    calls++;
    if (calls === 1) return json({ url: "https://storage.example.test/object", key: "unused" });
    if (calls === 2) return new Response(null, { status: 403 });
    return json({ key: "backup-key" });
  }), "backup-key");
  assert.equal(calls, 3);
});

test("backup session expiry gives a useful error, not generic Failed to fetch", async () => {
  let calls = 0;
  await assert.rejects(() => uploadAbodeDeliveryNote(pdf(), options, async () => {
    calls++;
    if (calls === 1) return json({ url: "https://storage.example.test/object", key: "unused" });
    if (calls === 2) throw new TypeError("Failed to fetch");
    return json({ error: "Unauthorized" }, 401);
  }), /session has expired/);
});

test("empty or oversized PDFs never start an upload", async () => {
  for (const file of [new File([], "dispatch-note-12345678.pdf"), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "dispatch-note-12345678.pdf")]) {
    await assert.rejects(() => uploadAbodeDeliveryNote(file, options, async () => {
      assert.fail("Invalid files must not reach the network");
    }), /up to 10 MB/);
  }
});
