import assert from "node:assert/strict";
import test from "node:test";
import { matchExistingInvoice } from "./existingInvoiceMatch";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { customers, jobs as jobTable, jobLineItems } from "@shared/schema";
import { storage } from "./storage";
import { xeroService } from "./xero";
import { registerExistingInvoiceRoutes } from "./existingInvoiceRoutes";

export function invoiceFixture() {
  const customer: any = { id: "customer", pricingTable2026: true };
  const specs = [
    ["script", 18, 2365, "first"], ["script", 18, 2365, "first"],
    ["Duck", 21, 1024, "second"], ["frog", 14, 1714, "second"],
    ["Up North", 12, 2291, "second"], ["script", 18, 2365, "second"], ["Mushroom ", 9, 4032, "second"],
  ] as const;
  const jobs: any[] = specs.map(([jobName, quantity, , group], i) => ({
    id: `job-${i}`, customerId: customer.id, jobNumber: 2000 + i, jobName, quantity,
    poNumber: null, dhlTrackingNumber: group, invoiceStatus: i === 2 || i === 3 ? "invoiced" : "ready",
    invoiceReference: i === 2 || i === 3 ? "INV-1362" : null, invoiceTotal: i === 2 ? 44.65 : i === 3 ? 23.1 : null,
  }));
  const items: any[] = specs.map(([, quantity, stitchCount], i) => ({
    id: `item-${i}`, jobId: jobs[i].id, quantity, stitchCount, jobType: "Embroidery", description: "",
  }));
  const invoice: any = {
    InvoiceID: "existing-xero-id", InvoiceNumber: "INV-1362", Type: "ACCREC",
    Status: "AUTHORISED", CurrencyCode: "GBP", LineAmountTypes: "Exclusive",
    Contact: { ContactID: "contact" }, Date: "2026-11-13", SubTotal: 211.5, Total: 253.8,
    LineItems: specs.map(([jobName, quantity, stitchCount]) => ({
      Description: `${jobName}, ${stitchCount} Stitches`, ItemCode: "Emb",
      Quantity: quantity, UnitAmount: 1.65, LineAmount: Math.round(quantity * 165) / 100,
    })),
  };
  invoice.LineItems.push(
    { ItemCode: "Carriage", Description: "Shipping (Consolidated) - Consolidated Back to Customer (5 boxes) - script, script", Quantity: 1, UnitAmount: 20, LineAmount: 20 },
    { ItemCode: "Carriage", Description: "Shipping (Consolidated) - Consolidated Back to Customer (2 boxes) - Duck, frog, Up North, script, Mushroom", Quantity: 1, UnitAmount: 10, LineAmount: 10 },
  );
  return { customer, jobs, items, invoice };
}

test("all seven jobs and both carriage lines reconcile to the supplied invoice totals", () => {
  const f = invoiceFixture();
  const totals = matchExistingInvoice(f.invoice, f.customer, f.jobs, f.items);
  assert.equal(Object.keys(totals).length, 7);
  assert.equal(Math.round(Object.values(totals).reduce((a, b) => a + b, 0) * 100), 21150);
  assert.equal(totals["job-2"], 44.65, "Keep previously recorded carriage attribution");
  assert.equal(totals["job-3"], 23.1);
});

test("three identical script lines cannot reuse one invoice line", () => {
  const f = invoiceFixture();
  f.invoice.LineItems.splice(0, 1);
  assert.throws(() => matchExistingInvoice(f.invoice, f.customer, f.jobs, f.items), /do not match/);
});

test("wrong quantities, prices and extra/missing carriage block reconciliation", () => {
  for (const change of [
    (f: ReturnType<typeof invoiceFixture>) => { f.invoice.LineItems[0].Quantity++; },
    (f: ReturnType<typeof invoiceFixture>) => { f.invoice.LineItems[0].UnitAmount = 2; },
    (f: ReturnType<typeof invoiceFixture>) => { f.invoice.LineItems.pop(); },
    (f: ReturnType<typeof invoiceFixture>) => { f.invoice.LineItems.push({ ItemCode: "Other", LineAmount: 5 }); },
    (f: ReturnType<typeof invoiceFixture>) => { f.invoice.LineItems.at(-1).Description = "Shipping - Unknown"; },
  ]) {
    const f = invoiceFixture(); change(f);
    assert.throws(() => matchExistingInvoice(f.invoice, f.customer, f.jobs, f.items));
  }
});

test("voided invoices, unsupported taxes and discounts never link", () => {
  for (const patch of [{ Status: "VOIDED" }, { LineAmountTypes: "Inclusive" }, { CurrencyCode: "USD" }]) {
    const f = invoiceFixture();
    assert.throws(() => matchExistingInvoice({ ...f.invoice, ...patch }, f.customer, f.jobs, f.items));
  }
  const f = invoiceFixture(); f.invoice.LineItems[0].DiscountRate = 10;
  assert.throws(() => matchExistingInvoice(f.invoice, f.customer, f.jobs, f.items), /Discounted/);
});

test("existing-invoice API previews safely and links all seven jobs atomically without creating an invoice", { timeout: 60000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const f = invoiceFixture();
  const [customer] = await db.insert(customers).values({ name: `Invoice linking fixture ${randomUUID()}`, pricingTable2026: true }).returning();
  const originals = { user: storage.getUser, read: xeroService.getInvoiceByNumber, contact: xeroService.findContact, create: xeroService.createConsolidatedInvoice };
  let creates = 0;
  storage.getUser = async (id: string) => ({ id, role: id === "denied" ? "staff" : "super_admin" } as any);
  xeroService.getInvoiceByNumber = async number => {
    assert.equal(number, "INV-1362");
    return structuredClone(f.invoice);
  };
  xeroService.findContact = async () => ({ contactID: "contact", name: customer.name });
  xeroService.createConsolidatedInvoice = async () => { creates++; throw new Error("Must never create another invoice"); };
  const app = express();
  app.use(express.json());
  registerExistingInvoiceRoutes(app, (req: any, res, next) => {
    if (!req.get("x-test-user")) return void res.sendStatus(401);
    req.session = { userId: req.get("x-test-user") }; next();
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/xero/link-existing-invoice`;
  try {
    const saved = await db.insert(jobTable).values(f.jobs.map(job => ({
      id: randomUUID(), customerId: customer.id, jobName: job.jobName, quantity: job.quantity,
      completed: true, invoiceStatus: job.invoiceStatus, invoiceReference: job.invoiceReference,
      invoiceTotal: job.invoiceTotal, dhlTrackingNumber: job.dhlTrackingNumber,
    }))).returning();
    await db.insert(jobLineItems).values(f.items.map((item, i) => ({
      id: randomUUID(), jobId: saved[i].id, jobType: item.jobType,
      quantity: item.quantity, stitchCount: item.stitchCount, completed: true,
    })));
    const jobIds = saved.filter(job => job.invoiceStatus === "ready").map(job => job.id);
    const call = (extra: object = {}, user = "admin") => fetch(url, {
      method: "POST", headers: { "content-type": "application/json", "x-test-user": user },
      body: JSON.stringify({ customerId: customer.id, jobIds, invoiceNumber: "1362", ...extra }),
    });
    assert.equal((await call({}, "")).status, 401);
    assert.equal((await call({}, "denied")).status, 403);
    const before = await db.select().from(jobTable).where(eq(jobTable.customerId, customer.id));
    const previewResponse = await call();
    assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
    const preview = await previewResponse.json();
    assert.equal(preview.jobs.length, 7);
    assert.equal(preview.jobs.filter((job: any) => job.alreadyLinked).length, 2);
    assert.equal(preview.total, 253.8);
    assert.equal(preview.linked, false);
    assert.deepEqual(await db.select().from(jobTable).where(eq(jobTable.customerId, customer.id)), before);
    assert.equal((await call({ confirm: true, previewHash: "outdated" })).status, 409);
    f.invoice.Contact.ContactID = "wrong-customer";
    assert.equal((await call()).status, 409);
    f.invoice.Contact.ContactID = "contact";
    f.invoice.LineItems[0].Quantity++;
    assert.equal((await call({ confirm: true, previewHash: preview.previewHash })).status, 409);
    f.invoice.LineItems[0].Quantity--;
    assert.deepEqual(await db.select().from(jobTable).where(eq(jobTable.customerId, customer.id)), before, "Failed checks must not update any job");
    assert.equal((await call({ confirm: true, previewHash: preview.previewHash })).status, 200);
    assert.equal((await call({ confirm: true, previewHash: preview.previewHash })).status, 200, "Retries remain safe");
    const after = await db.select().from(jobTable).where(eq(jobTable.customerId, customer.id));
    assert.ok(after.every(job => job.invoiceStatus === "invoiced" && job.invoiceReference === "INV-1362"));
    assert.equal(Math.round(after.reduce((sum, job) => sum + (job.invoiceTotal || 0), 0) * 100), 21150);
    assert.equal(creates, 0);
  } finally {
    storage.getUser = originals.user; xeroService.getInvoiceByNumber = originals.read;
    xeroService.findContact = originals.contact; xeroService.createConsolidatedInvoice = originals.create;
    await db.delete(jobTable).where(eq(jobTable.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
