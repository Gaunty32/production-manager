import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { db } from "./db";
import { storage } from "./storage";
import { jobs, stockingOrders } from "@shared/schema";
import { registerAbodeTrackingImport } from "./abodeTrackingImport";

// Exercise the authenticated route without touching live data, buying labels
// or invoking any courier, storage or email service.
test("tracking-only saves keep carrier records consistent without changing shipping or dispatch facts", async t => {
  const originalTransaction = db.transaction;
  const originalCustomers = storage.getCustomers;
  let rows: any[] = [];
  let updates: { table: unknown; values: Record<string, unknown> }[] = [];
  const selection: any = {};
  for (const key of ["from", "innerJoin", "where", "orderBy"]) selection[key] = () => selection;
  selection.for = async (lock: string) => {
    assert.equal(lock, "update");
    return rows;
  };
  (db as any).transaction = async (fn: any) => fn({
    select: () => selection,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => { updates.push({ table, values }); },
      }),
    }),
  });
  storage.getCustomers = async () => [{ id: "test-customer", name: "Abode Home & Gifts" }] as any;
  const app = express();
  app.use(express.json());
  registerAbodeTrackingImport(app, (req, res, next) => {
    if (req.get("x-test-staff") !== "yes") return void res.sendStatus(401);
    next();
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/abode/tracking/import`;
  const reset = () => {
    updates = [];
    rows = [{
      job: { id: "test-job", customerId: "test-customer", invoiceStatus: "ready", dhlTrackingNumber: null, shippingCarrier: "royal_mail" },
      order: { orderNumber: "TEST-ORDER", shippingRoute: "royal_mail", shipmentId: null, labelHtml: null, shipmentState: "unbooked", dispatchedAt: "2026-11-24T12:00:00Z" },
    }];
  };
  const send = (entries: unknown[], authorised = true) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authorised ? { "x-test-staff": "yes" } : {}) },
    body: JSON.stringify({ entries }),
  });
  const inpost = { orderNumber: "TEST-ORDER", carrier: "inpost", trackingNumber: "87NXM0311772A032" };
  try {
    await t.test("correct Royal Mail to InPost and save alphanumeric tracking without a label", async () => {
      reset();
      const response = await send([inpost]);
      assert.equal(response.status, 200);
      assert.deepEqual(updates, [
        { table: jobs, values: { dhlTrackingNumber: inpost.trackingNumber, shippingCarrier: "inpost" } },
        { table: stockingOrders, values: { shippingRoute: "inpost", trackingCheckedAt: null, trackingError: null } },
      ], "Only carrier/tracking fields may change: no carriage, label, invoice, despatch or email updates");
    });
    await t.test("existing DPD numbers still require exactly ten digits", async () => {
      reset();
      rows[0].order.shippingRoute = "dpd";
      rows[0].order.shipmentState = "review";
      assert.equal((await send([{ orderNumber: "TEST-ORDER", trackingNumber: "6565279532" }])).status, 200);
      updates = [];
      assert.equal((await send([{ orderNumber: "TEST-ORDER", trackingNumber: inpost.trackingNumber }])).status, 409);
      assert.equal(updates.length, 0);
    });
    await t.test("never replace different saved tracking or relabel a booked DPD shipment", async () => {
      reset();
      rows[0].job.dhlTrackingNumber = "DIFFERENT123";
      assert.equal((await send([inpost])).status, 409);
      assert.equal(updates.length, 0);
      reset();
      rows[0].order.shippingRoute = "dpd";
      rows[0].order.shipmentId = 123456;
      rows[0].order.labelHtml = "<p>Saved label</p>";
      assert.equal((await send([inpost])).status, 409);
      assert.equal(updates.length, 0);
    });
    await t.test("carrier corrections cannot change invoiced orders", async () => {
      reset();
      rows[0].job.invoiceStatus = "invoiced";
      assert.equal((await send([inpost])).status, 409);
      assert.equal(updates.length, 0);
    });
    await t.test("an invalid batch or unauthenticated caller writes nothing", async () => {
      reset();
      assert.equal((await send([inpost, { ...inpost, orderNumber: "MISSING-ORDER", trackingNumber: "OTHER12345" }])).status, 409);
      assert.equal(updates.length, 0);
      assert.equal((await send([inpost], false)).status, 401);
      assert.equal(updates.length, 0);
    });
  } finally {
    db.transaction = originalTransaction;
    storage.getCustomers = originalCustomers;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
