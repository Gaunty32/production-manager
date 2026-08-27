import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { weeklyArticleCampaignRuns, weeklyArticleCampaigns } from "@shared/schema";
import { KNOWLEDGE_CENTRE_ARTICLES, type KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import { getExternalKnowledgeCentreArticles } from "./knowledgeCentreFeed";
import { buildArticleCampaignEmailHtml, sendArticleCampaignEmail } from "./emailService";

const CAMPAIGN_ID = "weekly-article";
const HIGHLEVEL_BASE = "https://rest.gohighlevel.com/v1";
const LONDON_TIME_ZONE = "Europe/London";

export type HighLevelTag = { id: string; name: string };
export type HighLevelContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tags: unknown[];
};

function credentials() {
  const apiKey = process.env.HIGHLEVEL_API_KEY;
  const locationId = process.env.HIGHLEVEL_LOCATION_ID;
  if (!apiKey || !locationId) {
    throw new Error("HighLevel is not configured. HIGHLEVEL_API_KEY and HIGHLEVEL_LOCATION_ID are required.");
  }
  return { apiKey, locationId };
}

async function highLevelFetch(pathOrUrl: string): Promise<any> {
  const { apiKey } = credentials();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${HIGHLEVEL_BASE}${pathOrUrl}`;
  if (!url.startsWith(`${HIGHLEVEL_BASE}/`)) throw new Error("HighLevel returned an invalid pagination URL.");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.error || `request returned ${response.status}`;
    throw new Error(`HighLevel ${message}`);
  }
  return body;
}

export async function getHighLevelTags(): Promise<HighLevelTag[]> {
  const body = await highLevelFetch("/tags/");
  return (Array.isArray(body?.tags) ? body.tags : [])
    .map((tag: any) => ({ id: String(tag.id || tag.name || ""), name: String(tag.name || "").trim() }))
    .filter((tag: HighLevelTag) => tag.id && tag.name)
    .sort((a: HighLevelTag, b: HighLevelTag) => a.name.localeCompare(b.name));
}

function contactHasTag(contact: any, tag: HighLevelTag): boolean {
  const wantedId = tag.id.toLowerCase();
  const wantedName = tag.name.toLowerCase();
  return (Array.isArray(contact?.tags) ? contact.tags : []).some((value: any) => {
    if (typeof value === "string") return value.toLowerCase() === wantedName || value.toLowerCase() === wantedId;
    return String(value?.id || "").toLowerCase() === wantedId || String(value?.name || "").toLowerCase() === wantedName;
  });
}

export async function getHighLevelContactsByTag(tag: HighLevelTag): Promise<HighLevelContact[]> {
  credentials();
  const contacts: any[] = [];
  let nextUrl: string | null = `${HIGHLEVEL_BASE}/contacts/?limit=100`;
  for (let page = 0; nextUrl && page < 50; page++) {
    const body = await highLevelFetch(nextUrl);
    contacts.push(...(Array.isArray(body?.contacts) ? body.contacts : []));
    nextUrl = typeof body?.meta?.nextPageUrl === "string" && body.meta.nextPageUrl ? body.meta.nextPageUrl : null;
  }
  const seen = new Set<string>();
  return contacts
    .filter((contact) => contactHasTag(contact, tag) && typeof contact.email === "string" && contact.email.includes("@"))
    .filter((contact) => {
      const key = contact.email.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((contact) => ({
      id: String(contact.id),
      email: contact.email.trim(),
      firstName: contact.firstName || null,
      lastName: contact.lastName || null,
      tags: Array.isArray(contact.tags) ? contact.tags : [],
    }));
}

export async function getCampaignArticles(): Promise<KnowledgeCentreArticle[]> {
  const external = await getExternalKnowledgeCentreArticles();
  return [...external, ...KNOWLEDGE_CENTRE_ARTICLES].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export async function getCampaignConfig() {
  const [row] = await db.select().from(weeklyArticleCampaigns).where(eq(weeklyArticleCampaigns.id, CAMPAIGN_ID));
  return row || {
    id: CAMPAIGN_ID,
    enabled: false,
    tagId: null,
    tagName: null,
    articleSlug: null,
    subject: null,
    intro: "We thought you might find this useful.",
    updatedById: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function saveCampaignConfig(input: {
  enabled: boolean;
  tagId: string;
  tagName: string;
  articleSlug: string;
  subject: string;
  intro: string;
  updatedById: string;
}) {
  const [row] = await db.insert(weeklyArticleCampaigns).values({
    id: CAMPAIGN_ID,
    ...input,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: weeklyArticleCampaigns.id,
    set: { ...input, updatedAt: new Date() },
  }).returning();
  return row;
}

export async function getCampaignHistory() {
  return db.select().from(weeklyArticleCampaignRuns)
    .where(eq(weeklyArticleCampaignRuns.campaignId, CAMPAIGN_ID))
    .orderBy(desc(weeklyArticleCampaignRuns.startedAt))
    .limit(20);
}

function londonParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day"), weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function getNextCampaignLabel(date = new Date()) {
  const current = londonParts(date);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(current.weekday);
  let days = (7 - weekday) % 7;
  if (days === 0 && (current.hour > 17 || (current.hour === 17 && current.minute > 0))) days = 7;
  const londonDate = new Date(`${current.year}-${current.month}-${current.day}T12:00:00Z`);
  londonDate.setUTCDate(londonDate.getUTCDate() + days);
  return londonDate.toLocaleDateString("en-GB", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }) + " at 17:00";
}

async function resolveSelection(tagId: string, articleSlug: string) {
  const [tags, articles] = await Promise.all([getHighLevelTags(), getCampaignArticles()]);
  const tag = tags.find((item) => item.id === tagId);
  const article = articles.find((item) => item.slug === articleSlug);
  if (!tag) throw new Error("The selected HighLevel tag no longer exists.");
  if (!article) throw new Error("The selected article no longer exists.");
  return { tag, article };
}

function articleUrl(article: KnowledgeCentreArticle) {
  const base = process.env.BASE_URL?.replace(/\/$/, "") || "https://www.selectbranding.co.uk";
  return `${base}/knowledge-centre/${article.slug}`;
}

export async function buildCampaignPreview(input: { tagId: string; articleSlug: string; intro: string }) {
  const { tag, article } = await resolveSelection(input.tagId, input.articleSlug);
  const contacts = await getHighLevelContactsByTag(tag);
  return {
    recipientCount: contacts.length,
    tag,
    article,
    html: buildArticleCampaignEmailHtml({
      recipientFirstName: "Sam",
      intro: input.intro,
      articleTitle: article.title,
      articleExcerpt: article.excerpt,
      articleUrl: articleUrl(article),
      imageUrl: article.imageUrl,
    }),
  };
}

export async function sendCampaignTest(input: { to: string; subject: string; tagId: string; articleSlug: string; intro: string }) {
  const { article } = await resolveSelection(input.tagId, input.articleSlug);
  await sendArticleCampaignEmail({
    to: input.to,
    subject: input.subject,
    intro: input.intro,
    articleTitle: article.title,
    articleExcerpt: article.excerpt,
    articleUrl: articleUrl(article),
    imageUrl: article.imageUrl,
  });
}

async function runScheduledCampaign(slotKey: string) {
  const config = await getCampaignConfig();
  if (!config.enabled || !config.tagId || !config.articleSlug || !config.subject || !config.tagName) return;
  const { tag, article } = await resolveSelection(config.tagId, config.articleSlug);
  const [claimed] = await db.insert(weeklyArticleCampaignRuns).values({
    campaignId: CAMPAIGN_ID,
    slotKey,
    tagName: tag.name,
    articleTitle: article.title,
    subject: config.subject,
  }).onConflictDoNothing({ target: weeklyArticleCampaignRuns.slotKey }).returning();
  if (!claimed) return;

  let sent = 0;
  const failures: string[] = [];
  try {
    const contacts = await getHighLevelContactsByTag(tag);
    for (const contact of contacts) {
      try {
        await sendArticleCampaignEmail({
          to: contact.email,
          subject: config.subject,
          recipientFirstName: contact.firstName,
          intro: config.intro,
          articleTitle: article.title,
          articleExcerpt: article.excerpt,
          articleUrl: articleUrl(article),
          imageUrl: article.imageUrl,
        });
        sent++;
      } catch (error: any) {
        failures.push(`${contact.email}: ${error?.message || "send failed"}`.slice(0, 500));
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await db.update(weeklyArticleCampaignRuns).set({
      status: failures.length ? (sent ? "partial" : "failed") : "sent",
      recipientCount: contacts.length,
      sentCount: sent,
      failedCount: failures.length,
      failures: failures.slice(0, 50),
      finishedAt: new Date(),
    }).where(eq(weeklyArticleCampaignRuns.id, claimed.id));
  } catch (error: any) {
    await db.update(weeklyArticleCampaignRuns).set({
      status: "failed",
      sentCount: sent,
      failedCount: failures.length,
      failures: [...failures, String(error?.message || error)].slice(0, 50),
      finishedAt: new Date(),
    }).where(eq(weeklyArticleCampaignRuns.id, claimed.id));
    throw error;
  }
}

export function scheduleWeeklyArticleCampaign() {
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production") {
    console.log("[ArticleCampaign] Not in production — scheduler disabled");
    return;
  }
  const tick = async () => {
    const now = londonParts();
    if (now.weekday !== "Sun" || now.hour < 17) return;
    const slotKey = `${now.year}-${now.month}-${now.day}`;
    try {
      await runScheduledCampaign(slotKey);
    } catch (error) {
      console.error("[ArticleCampaign] Scheduled send failed:", error);
    }
  };
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, 15 * 60 * 1000);
  console.log("[ArticleCampaign] Scheduled — Sundays 17:00 Europe/London");
}