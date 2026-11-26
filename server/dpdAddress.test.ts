import assert from "node:assert/strict";
import { test } from "node:test";
import { dpdService } from "./dpd";
import { stockingShippingRoute } from "../shared/abode";

test("DPD preserves the second address line separately rather than exceeding the street limit", async () => {
  const service = dpdService as any;
  const originalFetch = globalThis.fetch;
  const originalAuth = service.authHeaders;
  const originalConfigured = service.isConfigured;
  let payload: any;
  service.isConfigured = () => true;
  service.authHeaders = async () => ({});
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    payload = JSON.parse(init.body as string);
    return Response.json({ data: { jobId: 123, consignmentDetail: [{ consignmentNumber: "TEST123456", parcelNumbers: [] }] } });
  }) as typeof fetch;
  try {
    const street = "26 Example Residential Way";
    const locality = "Example Place";
    await dpdService.createShipment({
      deferLabelFetch: true,
      recipient: { name: "Test Person", street, locality, city: "Guildford", zipCode: "GU1 3PH", country: "GB" },
      parcels: [{ weight: 4000 }], reference: "TEST-ADDRESS",
      additionalReferences: ["#2413 Valais Blacknose", "#2500 Third job"],
    });
    const address = payload.consignment[0].deliveryDetails.address;
    assert.equal(address.street, street);
    assert.equal(address.locality, locality);
    assert.equal(address.town, "Guildford");
    assert.equal(address.postcode, "GU1 3PH");
    assert.equal(payload.consignment[0].consignmentRef, "TEST-ADDRESS");
    assert.equal(payload.consignment[0].shippingRef1, "TEST-ADDRESS");
    assert.equal(payload.consignment[0].shippingRef2, "#2413 Valais Blacknose");
    assert.equal(payload.consignment[0].shippingRef3, "#2500 Third job");
  } finally {
    globalThis.fetch = originalFetch;
    service.authHeaders = originalAuth;
    service.isConfigured = originalConfigured;
  }
});

test("the reported Northern Ireland postcode stays on Royal Mail and Guildford stays on DPD", () => {
  assert.equal(stockingShippingRoute("BT52 1JR"), "royal_mail");
  assert.equal(stockingShippingRoute("GU1 3PH"), "dpd");
});
