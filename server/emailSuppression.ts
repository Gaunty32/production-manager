import { eq } from "drizzle-orm";
import { db } from "./db";
import { emailPermanentFailures } from "@shared/schema";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailPermanentlyFailed(email: string) {
  const [row] = await db.select({ email: emailPermanentFailures.email })
    .from(emailPermanentFailures)
    .where(eq(emailPermanentFailures.email, normalizeEmail(email)));
  return Boolean(row);
}

export async function filterPermanentlyFailedRecipients<T extends { email: string }>(recipients: T[]) {
  if (recipients.length === 0) return recipients;
  const rows = await db.select({ email: emailPermanentFailures.email }).from(emailPermanentFailures);
  const suppressed = new Set(rows.map((row) => normalizeEmail(row.email)));
  return recipients.filter((recipient) => !suppressed.has(normalizeEmail(recipient.email)));
}

export async function recordPermanentEmailFailure(email: string, error: unknown) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const lastError = String(error instanceof Error ? error.message : error || "Permanent email delivery failure").slice(0, 1000);
  const now = new Date();
  await db.insert(emailPermanentFailures).values({
    email: normalized,
    lastError,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: emailPermanentFailures.email,
    set: { lastError, updatedAt: now },
  });
}