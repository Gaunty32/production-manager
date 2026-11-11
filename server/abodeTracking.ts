import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { jobs, stockingOrders } from "@shared/schema";
import { db } from "./db";

const BASE = "https://api.customers.dpd.co.uk";
const INTERVAL = 15 * 60 * 1000;
export type DpdTrackingEvent = { key?: string; date?: string; time?: string; type?: string; status?: string };
export type DpdTrackedParcel = {
  parcelNumber?: string; consignmentNumber?: string; deliveryStatus?: string;
  parcelStatus?: string; deliveryDate?: string; trackingEvents?: DpdTrackingEvent[];
};
let access: { token: string; expires: number } | null = null;
let authPending: Promise<string> | null = null;

export function abodeTrackingConfigured(): boolean {
  return Boolean(process.env.DPD_TRACKING_CLIENT_ID && process.env.DPD_TRACKING_CLIENT_SECRET);
}

function validDay(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// Store the confirmed UK calendar date at midday UTC, avoiding the UK's BST
// offset moving a date-only scan onto the preceding day.
export function confirmedDeliveryDate(parcel: DpdTrackedParcel): Date | null {
  const scans = (parcel.trackingEvents || []).filter(event =>
    (event.key === "001" || /^Delivered(?:\s|-|$)/i.test(event.type || "")) &&
    !/return(?:ed)? to sender/i.test(`${event.type || ""} ${event.status || ""}`) &&
    validDay(event.date),
  ).map(event => event.date!).sort();
  const day = scans[0] || (/^delivered$/i.test(parcel.deliveryStatus || "") ? validDay(parcel.deliveryDate) : null);
  return day ? new Date(`${day}T12:00:00Z`) : null;
}

async function token(): Promise<string> {
  if (access && access.expires > Date.now()) return access.token;
  if (authPending) return authPending;
  authPending = (async () => {
    const response = await fetch(`${BASE}/v1/customer/auth/access`, {
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.DPD_TRACKING_CLIENT_ID}:${process.env.DPD_TRACKING_CLIENT_SECRET}`).toString("base64")}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`DPD tracking authentication failed (${response.status}). Check the tracking API connection.`);
    const payload = await response.json() as { data?: { accessToken?: string } };
    if (!payload.data?.accessToken) throw new Error("DPD did not return a tracking access token.");
    // Keep tokens in memory, never in database records, logs or client payloads.
    access = { token: payload.data.accessToken, expires: Date.now() + 5 * 60 * 1000 };
    return access.token;
  })();
  try { return await authPending; } finally { authPending = null; }
}

async function trackingRequest(body: object, page = 1): Promise<{ data?: { parcelDetails?: DpdTrackedParcel[]; searchKey?: string; totalResults?: number } }> {
  const response = await fetch(`${BASE}/v1/customer/parcel/tracking?pageSize=10&pageNumber=${page}`, {
    method: "POST", headers: { Authorization: `Bearer ${await token()}`, "client-id": process.env.DPD_TRACKING_CLIENT_ID!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (response.status === 401) access = null;
    throw new Error(`DPD tracking request failed (${response.status}).`);
  }
  const payload = await response.json() as { data?: { parcelDetails?: DpdTrackedParcel[]; searchKey?: string; totalResults?: number } };
  if (!payload.data || !Array.isArray(payload.data.parcelDetails)) throw new Error("DPD tracking returned no readable parcel data.");
  return payload;
}

export async function lookupAbodeTracking(order: typeof stockingOrders.$inferSelect, trackingNumber: string) {
  const numbers = (order.parcelNumbers || []).filter(value => /^\d{14}$/.test(value));
  const first = await trackingRequest(numbers.length ? { parcelNumbers: numbers } : { customerReference: order.orderNumber, postcode: order.recipient.postcode });
  const all = [...first.data!.parcelDetails!];
  const pages = Math.ceil((first.data!.totalResults || all.length) / 10);
  if (pages > 10) throw new Error("DPD returned too many matching parcels. Review this order's tracking reference.");
  if (pages > 1 && !first.data!.searchKey) throw new Error("DPD tracking results were incomplete.");
  for (let page = 2; page <= pages; page++) {
    all.push(...(await trackingRequest({ searchKey: first.data!.searchKey }, page)).data!.parcelDetails!);
  }
  const parcels = all.filter(parcel => numbers.length
    ? numbers.includes(parcel.parcelNumber || "")
    : parcel.consignmentNumber === trackingNumber || parcel.parcelNumber === trackingNumber);
  if (!parcels.length || (numbers.length && numbers.some(number => !parcels.some(p => p.parcelNumber === number)))) {
    throw new Error("DPD has not returned tracking scans for this shipment yet.");
  }
  const dates = parcels.map(confirmedDeliveryDate);
  return {
    deliveredAt: dates.every(Boolean) ? new Date(Math.max(...dates.map(date => date!.getTime()))) : null,
    status: parcels.map(parcel => parcel.parcelStatus || parcel.deliveryStatus || "Awaiting courier scans").filter((value, i, list) => list.indexOf(value) === i).join(" · ").slice(0, 500),
    parcelNumbers: parcels.map(parcel => parcel.parcelNumber).filter((value): value is string => Boolean(value)),
  };
}

export async function syncAbodeTracking(customerId?: string) {
  if (!abodeTrackingConfigured()) return { configured: false, updated: 0, errors: 0 };
  const cutoff = new Date(Date.now() - INTERVAL);
  const candidates = await db.select({ order: stockingOrders, tracking: jobs.dhlTrackingNumber }).from(stockingOrders)
    .innerJoin(jobs, eq(jobs.id, stockingOrders.jobId))
    .where(and(
      eq(stockingOrders.shippingRoute, "dpd"), isNull(stockingOrders.deliveredAt), isNotNull(jobs.dhlTrackingNumber),
      or(isNull(stockingOrders.trackingCheckedAt), lt(stockingOrders.trackingCheckedAt, cutoff)),
      customerId ? eq(stockingOrders.customerId, customerId) : undefined,
    )).limit(100);
  let updated = 0, errors = 0;
  for (const { order, tracking } of candidates) {
    // Durable claim/rate limit across multiple app instances. Cache failures too.
    const claimed = await db.update(stockingOrders).set({ trackingCheckedAt: new Date() }).where(and(
      eq(stockingOrders.jobId, order.jobId),
      or(isNull(stockingOrders.trackingCheckedAt), lt(stockingOrders.trackingCheckedAt, cutoff)),
    )).returning({ id: stockingOrders.jobId });
    if (!claimed.length) continue;
    try {
      const result = await lookupAbodeTracking(order, tracking!);
      await db.update(stockingOrders).set({
        trackingStatus: result.status, deliveredAt: result.deliveredAt,
        parcelNumbers: result.parcelNumbers.length ? result.parcelNumbers : order.parcelNumbers,
        trackingError: null,
      }).where(eq(stockingOrders.jobId, order.jobId));
      updated++;
    } catch {
      // Do not expose provider payloads, addresses or credential details.
      await db.update(stockingOrders).set({ trackingError: "Courier tracking could not be updated. The last confirmed details have been kept; another check will run automatically." }).where(eq(stockingOrders.jobId, order.jobId));
      errors++;
    }
  }
  return { configured: true, updated, errors };
}

export function startAbodeTrackingWorker() {
  if (process.env.NODE_ENV !== "production") return;
  const run = () => void syncAbodeTracking().catch(() => console.error("[Abode] Automatic tracking refresh failed"));
  setTimeout(run, 30_000).unref();
  setInterval(run, INTERVAL).unref();
}
