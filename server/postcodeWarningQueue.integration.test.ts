import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import { customers, jobs, postcodeWarningEmails } from "@shared/schema";

test("saved small orders queue a single postcode alert atomically without sending email", async () => {
  if (process.env.NODE_ENV === "production") throw new Error("This test must only run against the development database.");
  const [customer] = await db.insert(customers).values({
    name: `Postcode queue test ${randomUUID()}`, address: "Belfast\nBT1 1AA",
    email: null, creditAccount: true,
  }).returning();
  let jobId: string | undefined;
  try {
    const job = await storage.createJob({
      customerId: customer.id, jobName: "Postcode queue test only", quantity: 1,
      packageCount: 1, packageType: "boxes", shippingMethod: "direct_delivery",
      deliveryAddressType: "customer",
    });
    jobId = job.id;
    let queued = await db.select().from(postcodeWarningEmails).where(eq(postcodeWarningEmails.jobId, jobId));
    assert.equal(queued.length, 1);
    assert.equal(queued[0].postcode, "BT1 1AA");
    assert.equal(queued[0].sentAt, null);
    await storage.updateJob(job.id, { shippingMethod: "direct_delivery", packageCount: 1 });
    queued = await db.select().from(postcodeWarningEmails).where(eq(postcodeWarningEmails.jobId, jobId));
    assert.equal(queued.length, 1);
    await storage.updateJob(job.id, { dispatchPostcode: "IV1 1AA" });
    queued = await db.select().from(postcodeWarningEmails).where(eq(postcodeWarningEmails.jobId, jobId));
    assert.equal(queued.length, 2);
  } finally {
    if (jobId) await db.delete(jobs).where(eq(jobs.id, jobId));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await pool.end();
  }
});
