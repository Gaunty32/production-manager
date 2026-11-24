import { and, eq, like } from "drizzle-orm";
import { db } from "./db";
import { jobFiles, stockingOrders } from "@shared/schema";
import { INPOST_LABEL_PREFIX } from "./abodeInpostLabel";

/** Derived from verified, saved labels, never from a browser's invoice payload. */
export async function addConfirmedAbodeLabels<T extends { id: string; shippingCarrier?: string | null }>(jobs: T[]) {
  if (!jobs.some(job => job.shippingCarrier === "inpost")) {
    return jobs.map(job => ({ ...job, confirmedExternalShippingLabel: false }));
  }
  const saved = await db.select({ jobId: stockingOrders.jobId }).from(stockingOrders)
    .innerJoin(jobFiles, eq(jobFiles.jobId, stockingOrders.jobId))
    .where(and(eq(stockingOrders.shippingRoute, "inpost"), like(jobFiles.fileName, `${INPOST_LABEL_PREFIX}%`)));
  const ids = new Set(saved.map(row => row.jobId));
  return jobs.map(job => ({
    ...job, confirmedExternalShippingLabel: job.shippingCarrier === "inpost" && ids.has(job.id),
  }));
}
