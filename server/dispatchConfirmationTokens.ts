import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const LIFETIME_SECONDS = 90 * 24 * 60 * 60;
const PURPOSE = "dispatch-confirmation-v1";

export interface DispatchTokenPayload {
  jobId: string;
  customerId: string;
  shipment: string;
  expires: number;
}

export function shipmentFingerprint(trackingNumber: string): string {
  return createHash("sha256").update(trackingNumber.trim()).digest("hex");
}

function signature(payload: string, secret: string): string {
  if (!secret) throw new Error("Dispatch sharing is not configured");
  return createHmac("sha256", secret).update(`${PURPOSE}:${payload}`).digest("base64url");
}

export function createDispatchToken(
  job: { id: string; customerId: string; dhlTrackingNumber: string },
  secret: string,
  now = Date.now(),
): string {
  const payload: DispatchTokenPayload = {
    jobId: job.id,
    customerId: job.customerId,
    shipment: shipmentFingerprint(job.dhlTrackingNumber),
    expires: Math.floor(now / 1000) + LIFETIME_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyDispatchToken(token: string, secret: string, now = Date.now()): DispatchTokenPayload | null {
  if (!secret || token.length > 1200) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  const [encoded, supplied] = parts;
  const expected = signature(encoded, secret);
  // Compare canonical encoded signatures too; don't accept alternate base64 spellings.
  if (supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.jobId !== "string" || !/^[a-f0-9-]{36}$/i.test(payload.jobId) ||
      typeof payload.customerId !== "string" || !/^[a-f0-9-]{36}$/i.test(payload.customerId) ||
      typeof payload.shipment !== "string" || !/^[a-f0-9]{64}$/.test(payload.shipment) ||
      !Number.isSafeInteger(payload.expires) || payload.expires <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
