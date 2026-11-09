import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectAbodeReferenceFile, uploadAbodeReferenceFile } from "../client/src/lib/abodeReferenceUpload";
import { abodeReferenceContentType } from "@shared/abodeReferenceFiles";

const pdfBytes = "%PDF-1.7\noriginal embroidery printout\n%%EOF";
const options = { fallbackUrl: "/api/abode/orders/job/items/item/samples/upload" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

for (const browserType of ["", "application/octet-stream", "application/x-pdf", "application/pdf"]) {
  test(`a genuine PDF uploads with canonical PDF type when the browser reports ${browserType || "no type"}`, async () => {
    const file = new File([pdfBytes], "Charlotte_Print.pdf", { type: browserType });
    assert.equal(await inspectAbodeReferenceFile(file), "application/pdf");
    let calls = 0;
    const key = await uploadAbodeReferenceFile(file, options, async (_url, init) => {
      if (++calls === 1) return json({ url: "https://storage.example.test/object", key: "/objects/uploads/proof" });
      assert.equal(init?.method, "PUT");
      assert.equal(init?.credentials, "omit");
      assert.equal(new Headers(init?.headers).get("Content-Type"), "application/pdf");
      assert.equal(init?.body, file, "Preserve the exact supplied PDF bytes");
      return new Response(null, { status: 200 });
    });
    assert.equal(key, "/objects/uploads/proof");
    assert.equal(calls, 2);
  });
}

test("a generically labelled PDF uses the bounded same-origin backup when storage is unreachable", async () => {
  let calls = 0;
  const file = new File([pdfBytes], "Charlotte_Print.pdf", { type: "application/octet-stream" });
  const key = await uploadAbodeReferenceFile(file, options, async (url, init) => {
    calls++;
    if (calls === 1) return json({ url: "https://storage.example.test/object", key: "/objects/uploads/direct" });
    if (calls === 2) throw new TypeError("Failed to fetch");
    assert.equal(String(url), options.fallbackUrl);
    assert.equal(init?.credentials, "include");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/pdf");
    assert.equal(init?.body, file);
    return json({ key: "/objects/uploads/backup" });
  });
  assert.equal(key, "/objects/uploads/backup");
  assert.equal(calls, 3);
});

for (const name of ["Charlotte.EMB", "disguised.pdf"]) {
  test(`${name} containing embroidery-source bytes is rejected before upload`, async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], name, { type: "application/pdf" });
    await assert.rejects(() => uploadAbodeReferenceFile(file, options, async () => {
      assert.fail("Unsupported files must never reach storage");
    }), name.endsWith(".EMB") ? /EMB files need embroidery software/ : /not a readable PDF/);
  });
}

test("HTML renamed to PDF is not accepted", async () => {
  await assert.rejects(() => inspectAbodeReferenceFile(new File(["<html>not a proof</html>"], "proof.pdf", { type: "application/pdf" })), /not a readable PDF/);
});

test("empty and oversized proofs have distinct errors", async () => {
  await assert.rejects(() => inspectAbodeReferenceFile(new File([], "empty.pdf")), /empty/);
  await assert.rejects(() => inspectAbodeReferenceFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf")), /larger than 10 MB/);
});

test("recognises only the supported PDF/image signatures", () => {
  assert.equal(abodeReferenceContentType(Buffer.from(pdfBytes)), "application/pdf");
  assert.equal(abodeReferenceContentType(Buffer.from([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(abodeReferenceContentType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
  assert.equal(abodeReferenceContentType(Buffer.from("RIFF0000WEBP")), "image/webp");
  assert.equal(abodeReferenceContentType(Buffer.from("RIFF0000WAVE")), null);
  assert.equal(abodeReferenceContentType(Buffer.from("<svg/>")), null);
  assert.equal(abodeReferenceContentType(new Uint8Array()), null);
});
