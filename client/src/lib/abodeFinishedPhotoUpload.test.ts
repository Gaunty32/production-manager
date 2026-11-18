import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadAbodeFinishedPhoto } from "./abodeFinishedPhotoUpload";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const json = (body: unknown, status = 200) => Response.json(body, { status });
const target = { jobId: "order-1", lineItemId: "stocking-1" };

for (const type of ["image/png", "", "application/octet-stream"]) {
  test(`photo saves to its order and stocking with browser type ${type || "missing"}`, async () => {
    const file = new File([png], "finished.png", { type });
    const calls: string[] = [];
    await uploadAbodeFinishedPhoto(file, target, async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) return json({ url: "https://storage.example.test/photo", key: "/objects/uploads/photo" });
      if (calls.length === 2) {
        assert.equal(init?.method, "PUT");
        assert.equal(new Headers(init?.headers).get("Content-Type"), "image/png");
        assert.equal(init?.body, file);
        return new Response(null, { status: 200 });
      }
      assert.equal(String(url), "/api/abode/orders/order-1/photos");
      assert.equal(init?.credentials, "include");
      assert.deepEqual(JSON.parse(String(init?.body)), { objectKey: "/objects/uploads/photo", fileName: file.name, lineItemId: "stocking-1" });
      return json({ success: true });
    });
    assert.equal(calls.length, 3);
  });
}

test("failed direct upload uses the bounded backup with the correct stocking", async () => {
  let calls = 0;
  await uploadAbodeFinishedPhoto(new File([png], "finished.png"), target, async (url, init) => {
    calls++;
    if (calls === 1) return json({ url: "https://storage.example.test/photo", key: "/objects/uploads/direct" });
    if (calls === 2) throw new TypeError("Failed to fetch");
    if (calls === 3) {
      assert.equal(String(url), "/api/abode/orders/order-1/photos/upload");
      assert.equal(new Headers(init?.headers).get("x-line-item-id"), "stocking-1");
      return json({ key: "/objects/uploads/backup" });
    }
    assert.equal(JSON.parse(String(init?.body)).objectKey, "/objects/uploads/backup");
    return json({ success: true });
  });
  assert.equal(calls, 4);
});

test("PDFs, empty, oversized and disguised files never start uploading", async () => {
  for (const file of [
    new File(["%PDF-1.7"], "note.pdf"),
    new File([], "empty.png"),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png"),
    new File(["<script>not a photo</script>"], "fake.jpg", { type: "image/jpeg" }),
  ]) {
    await assert.rejects(() => uploadAbodeFinishedPhoto(file, target, async () => {
      assert.fail("Invalid photos must never reach storage");
    }));
  }
});

test("attachment rejection and expired sessions are reported as failures", async () => {
  for (const status of [400, 401]) {
    let calls = 0;
    await assert.rejects(() => uploadAbodeFinishedPhoto(new File([png], "finished.png"), target, async () => {
      calls++;
      if (calls === 1) return json({ url: "https://storage.example.test/photo", key: "/objects/uploads/photo" });
      if (calls === 2) return new Response(null, { status: 200 });
      return json({ error: "Complete this stocking first" }, status);
    }), status === 401 ? /session has expired/ : /Complete this stocking first/);
  }
});
