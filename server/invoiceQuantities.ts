import { eq, inArray, like } from "drizzle-orm";
import { appSettings, jobLineItems, jobs } from "@shared/schema";
import { invoiceQuantitySchema } from "@shared/invoice-quantities";
import { db } from "./db";

const PREFIX = "invoice-quantity:";

export async function getInvoiceQuantities(): Promise<Record<string, number>> {
  const rows = await db.select().from(appSettings).where(like(appSettings.key, `${PREFIX}%`));
  return Object.fromEntries(rows.map(row => [
    row.key.slice(PREFIX.length), invoiceQuantitySchema.parse(JSON.parse(row.value)),
  ]));
}

export async function saveInvoiceQuantity(lineItemId: string, quantity: number | null) {
  return db.transaction(async tx => {
    const [item] = await tx.select().from(jobLineItems).where(eq(jobLineItems.id, lineItemId));
    if (!item?.jobId) return { status: 404, error: "Line item not found" };
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, item.jobId)).for("update");
    if (job?.invoiceStatus !== "ready") {
      return { status: 409, error: "Quantities can only be edited before the invoice is generated" };
    }
    const key = `${PREFIX}${lineItemId}`;
    if (quantity === null) {
      await tx.delete(appSettings).where(eq(appSettings.key, key));
    } else {
      const value = JSON.stringify(invoiceQuantitySchema.parse(quantity));
      await tx.insert(appSettings).values({ key, value }).onConflictDoUpdate({
        target: appSettings.key, set: { value, updatedAt: new Date() },
      });
    }
    return { status: 200 };
  });
}

export async function clearInvoiceQuantities(lineItemIds: string[]) {
  if (lineItemIds.length) {
    await db.delete(appSettings).where(inArray(appSettings.key, lineItemIds.map(id => `${PREFIX}${id}`)));
  }
}
