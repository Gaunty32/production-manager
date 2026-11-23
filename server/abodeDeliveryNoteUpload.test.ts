import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadAbodeDeliveryNote, prepareAbodeDeliveryNote } from "../client/src/lib/abodeDeliveryNoteUpload";

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
      assert.equal(await (init?.body as File).text(), await file.text());
      assert.equal((init?.body as File).name, file.name);
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

test("selection snapshots the entire PDF before the original device file becomes unavailable", async () => {
  const file = pdf();
  const originalBytes = await file.text();
  let reads = 0;
  const read = file.arrayBuffer.bind(file);
  file.arrayBuffer = async () => {
    reads++;
    if (reads > 1) throw new DOMException("File no longer exists", "NotFoundError");
    return read();
  };
  const preparing = prepareAbodeDeliveryNote(file);
  assert.equal(reads, 1, "Read starts immediately on selection, not after import");
  const snapshot = await preparing;
  assert.notEqual(snapshot, file);
  assert.equal(snapshot.name, file.name);
  assert.equal(snapshot.lastModified, file.lastModified);
  assert.equal(await snapshot.text(), originalBytes);
  assert.equal(await prepareAbodeDeliveryNote(file), snapshot, "Retries use retained bytes");
  let requests = 0;
  await uploadAbodeDeliveryNote(file, options, async (_url, init) => {
    requests++;
    if (requests === 1) return json({ url: "https://storage.example.test/pdf", key: "saved" });
    assert.equal(await (init?.body as File).text(), originalBytes);
    return new Response(null, { status: 200 });
  });
  assert.equal(reads, 1);
});

test("unreadable PDFs explain reselection and make no upload requests", async () => {
  for (const name of ["NotFoundError", "NotReadableError"]) {
    const file = pdf();
    file.arrayBuffer = async () => { throw new DOMException("A requested file could not be found", name); };
    await assert.rejects(() => uploadAbodeDeliveryNote(file, options, async () => {
      assert.fail("An unreadable device file must not request storage or attachment");
    }), /drop or choose it again.*orders and labels are unchanged/);
  }
});

test("reselecting the same file metadata can recover from an unreadable handle", async () => {
  const broken = pdf();
  broken.arrayBuffer = async () => { throw new DOMException("Missing", "NotFoundError"); };
  await assert.rejects(prepareAbodeDeliveryNote(broken), /read from your device/);
  const replacement = new File(["%PDF-1.7\noriginal pages\n%%EOF"], broken.name, {
    type: broken.type, lastModified: broken.lastModified,
  });
  assert.equal(replacement.size, broken.size);
  assert.equal((await prepareAbodeDeliveryNote(replacement)).name, broken.name);
});

test("invalid PDF content is rejected before storage is contacted", async () => {
  const file = new File(["not a PDF"], "dispatch-note-12345678.pdf", { type: "application/pdf" });
  await assert.rejects(() => uploadAbodeDeliveryNote(file, options, async () => {
    assert.fail("Invalid PDF content must not be uploaded");
  }), /not a valid PDF/);
});
