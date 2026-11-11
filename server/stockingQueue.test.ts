import assert from "node:assert/strict";
import { test } from "node:test";
import { isStockingWorkflowJob } from "../shared/abode";

const stockingDetails = { colour: "Red", font: "Font 1", thread: "Gold", name: "JANE" };

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
