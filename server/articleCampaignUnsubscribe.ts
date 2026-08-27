import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { weeklyArticleCampaignUnsubscribes } from "@shared/schema";

const UNSUBSCRIBE_URL = "https://www.selectbranding.co.uk/unsubscribe/weekly-articles";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function signature(email: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for campaign unsubscribe links.");
  return crypto.createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}

export function articleCampaignUnsubscribeUrl(email: string) {
  const normalized = normalizeEmail(email);
  return `${UNSUBSCRIBE_URL}?email=${encodeURIComponent(normalized)}&token=${signature(normalized)}`;
}

export function isValidArticleCampaignUnsubscribeToken(email: string, token: string) {
  if (!email || !/^[a-f0-9]{64}$/i.test(token || "")) return false;
  const expected = signature(email);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
}

export async function isArticleCampaignUnsubscribed(email: string) {
  const [row] = await db.select({ email: weeklyArticleCampaignUnsubscribes.email })
    .from(weeklyArticleCampaignUnsubscribes)
    .where(eq(weeklyArticleCampaignUnsubscribes.email, normalizeEmail(email)));
  return Boolean(row);
}

export async function filterArticleCampaignRecipients<T extends { email: string }>(recipients: T[]) {
  const rows = await db.select({ email: weeklyArticleCampaignUnsubscribes.email })
    .from(weeklyArticleCampaignUnsubscribes);
  const unsubscribed = new Set(rows.map((row) => normalizeEmail(row.email)));
  return recipients.filter((recipient) => !unsubscribed.has(normalizeEmail(recipient.email)));
}

export async function unsubscribeFromArticleCampaign(email: string) {
  const normalized = normalizeEmail(email);
  await db.insert(weeklyArticleCampaignUnsubscribes)
    .values({ email: normalized })
    .onConflictDoNothing();
}