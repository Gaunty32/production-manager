import assert from "node:assert/strict";
import { test } from "node:test";
import { saveExistingAbodeTracking } from "./abodeTracking";

test("saving existing tracking only records the consignment without requesting labels or booking shipping", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ saved: 1 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await saveExistingAbodeTracking("TEST-ORDER", " 6565279532 "), { saved: 1 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/abode/tracking/import");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.credentials, "include");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      entries: [{ orderNumber: "TEST-ORDER", trackingNumber: "6565279532" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conflicting tracking is reported rather than silently replaced or retried as a booking", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return Response.json({ error: "Order already has a different tracking number; nothing was changed" }, { status: 409 });
  }) as typeof fetch;
  try {
    await assert.rejects(saveExistingAbodeTracking("TEST-ORDER", "6565279532"), /different tracking number/);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("InPost tracking includes the explicit carrier without requiring a label or shipment ID", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async (url, init) => {
    requests++;
    assert.equal(String(url), "/api/abode/tracking/import");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      entries: [{ orderNumber: "TEST-INPOST", trackingNumber: "87NXM0311772A032", carrier: "inpost" }],
    });
    return Response.json({ saved: 1 });
  }) as typeof fetch;
  try {
    await saveExistingAbodeTracking("TEST-INPOST", "87NXM0311772A032", "inpost");
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
