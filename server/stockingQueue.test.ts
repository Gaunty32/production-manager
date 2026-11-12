import assert from "node:assert/strict";
import { test } from "node:test";
import { isStockingWorkflowJob, splitStockingRegister, stockingTrackingStatus } from "../shared/abode";

const stockingDetails = { colour: "Red", font: "Font 1", thread: "Gold", name: "JANE" };

test("register keeps production separate from label-based despatch", () => {
  const orders = [
    { id: "working", completed: false, dispatchedAt: null, deliveredAt: null },
    { id: "ready", completed: true, dispatchedAt: null, deliveredAt: null },
    { id: "label-created", completed: false, dispatchedAt: "2026-11-12", deliveredAt: null, dhlTrackingNumber: "TEST" },
    { id: "despatched", completed: true, dispatchedAt: "2026-11-12", deliveredAt: null },
    { id: "delivered", completed: true, dispatchedAt: "2026-11-11", deliveredAt: "2026-11-12" },
    { id: "historic-delivered", completed: true, dispatchedAt: null, deliveredAt: "2026-11-12" },
  ];
  const { awaitingProduction, despatched } = splitStockingRegister(orders);
  assert.deepEqual(awaitingProduction.map(order => order.id), ["working", "ready"]);
  assert.deepEqual(despatched.map(order => order.id), ["label-created", "despatched", "delivered", "historic-delivered"]);
  assert.equal(new Set([...awaitingProduction, ...despatched]).size, orders.length);
  const empty = splitStockingRegister([]);
  assert.deepEqual(empty, { awaitingProduction: [], despatched: [] });
});

test("legacy label wording cannot contradict despatch or confirmed delivery", () => {
  const order = { dispatchedAt: "2026-11-12", deliveredAt: null as string | null, trackingStatus: "Label created — awaiting despatch" as string | null };
  assert.equal(stockingTrackingStatus(order), "Despatched");
  assert.equal(stockingTrackingStatus({ ...order, trackingStatus: null }), "Despatched");
  assert.equal(stockingTrackingStatus({ ...order, trackingStatus: "Out for delivery" }), "Out for delivery");
  assert.equal(stockingTrackingStatus({ ...order, deliveredAt: "2026-11-13" }), "Delivered");
});

test("marking actual despatch moves the order into the Despatched section", () => {
  const order = { dispatchedAt: null as string | null };
  assert.equal(splitStockingRegister([order]).awaitingProduction.length, 1);
  order.dispatchedAt = "2026-11-12T12:00:00Z";
  assert.equal(splitStockingRegister([order]).despatched.length, 1);
  assert.equal(splitStockingRegister([order]).awaitingProduction.length, 0);
});

test("stocking imports are excluded from the main queue before and after completion", () => {
  for (const completed of [false, true]) {
    const stocking = { id: "stocking", completed, invoiceStatus: completed ? "ready" : "pending", lineItems: [{ stockingDetails }] };
    const ordinary = { id: "ordinary", completed, invoiceStatus: completed ? "ready" : "pending", lineItems: [{ stockingDetails: null }] };
    const sharedJobs = [stocking, ordinary];
    const mainQueue = sharedJobs.filter(job => !isStockingWorkflowJob(job));
    assert.deepEqual(mainQueue.map(job => job.id), ["ordinary"]);
    assert.equal(sharedJobs.length, 2, "Filtering must not remove orders from the shared invoicing data");
    assert.equal(sharedJobs.filter(job => job.invoiceStatus === "ready").some(job => job.id === "stocking"), completed);
  }
});

test("ordinary Abode jobs and other customers' jobs stay in the main queue", () => {
  for (const job of [
    {}, { lineItems: null }, { lineItems: [] }, { lineItems: [{}] },
    { lineItems: [{ stockingDetails: null }] },
  ]) assert.equal(isStockingWorkflowJob(job), false);
  assert.equal(isStockingWorkflowJob({ lineItems: [{ stockingDetails: null }, { stockingDetails }] }), true);
});
