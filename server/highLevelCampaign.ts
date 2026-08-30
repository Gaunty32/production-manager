import { and, desc, eq, gte, gt, lt } from "drizzle-orm";
import { db } from "./db";
import {
  customers,
  customerUsers,
  weeklyArticleCampaignRecipients,
  weeklyArticleCampaignRuns,
  weeklyArticleCampaigns,
} from "@shared/schema";
import { KNOWLEDGE_CENTRE_ARTICLES, type KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import { getExternalKnowledgeCentreArticles } from "./knowledgeCentreFeed";
import { buildArticleCampaignEmailHtml, sendArticleCampaignEmail } from "./emailService";
import {
  articleCampaignUnsubscribeUrl,
  filterArticleCampaignRecipients,
  isArticleCampaignUnsubscribed,
} from "./articleCampaignUnsubscribe";
import { isEmailPermanentlyFailed, recordPermanentEmailFailure } from "./emailSuppression";

const CAMPAIGN_ID = "weekly-article";
const HIGHLEVEL_BASE = "https://rest.gohighlevel.com/v1";
const LONDON_TIME_ZONE = "Europe/London";
const ARTICLE_COOLDOWN_WEEKS = 16;
const ARTICLE_COOLDOWN_MS = ARTICLE_COOLDOWN_WEEKS * 7 * 24 * 60 * 60 * 1000;
const HIGHLEVEL_CONTACT_CACHE_MS = 5 * 60 * 1000;

export type HighLevelTag = { id: string; name: string };
export type HighLevelContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tags: unknown[];
};

export type CampaignAudienceSelection = {
  audienceSource: "highlevel_tag" | "customers";
  customerSelectionMode: "all" | "selected";
  selectedCustomerIds: string[];
  excludedCustomerUserIds: string[];
};

function credentials() {
  const apiKey = process.env.HIGHLEVEL_API_KEY;
  if (!apiKey) {
    throw new Error("HighLevel is not configured. HIGHLEVEL_API_KEY is required.");
  }
  return { apiKey };
}

async function highLevelFetch(pathOrUrl: string): Promise<any> {
  const { apiKey } = credentials();
  const rawUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${HIGHLEVEL_BASE}${pathOrUrl}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("HighLevel returned an invalid pagination URL.");
  }
  const baseUrl = new URL(HIGHLEVEL_BASE);
  if (parsedUrl.hostname !== baseUrl.hostname || !parsedUrl.pathname.startsWith("/v1/")) {
    throw new Error("HighLevel returned an invalid pagination URL.");
  }
  // The legacy endpoint currently returns an http nextPageUrl even when the
  // initial request is HTTPS. Keep the request encrypted while preserving the
  // provider's pagination query.
  parsedUrl.protocol = "https:";
  const url = parsedUrl.toString();
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

let highLevelContactsCache: { expiresAt: number; contacts: any[] } | undefined;
let highLevelContactsRequest: Promise<any[]> | undefined;

async function getAllHighLevelContacts(): Promise<any[]> {
  if (highLevelContactsCache && highLevelContactsCache.expiresAt > Date.now()) {
    return highLevelContactsCache.contacts;
  }
  if (highLevelContactsRequest) return highLevelContactsRequest;

  highLevelContactsRequest = (async () => {
    credentials();
    const contacts: any[] = [];
    let nextUrl: string | null = `${HIGHLEVEL_BASE}/contacts/?limit=100`;
    const visitedUrls = new Set<string>();
    for (let page = 0; nextUrl; page++) {
      if (page > 1000 || visitedUrls.has(nextUrl)) {
        throw new Error("HighLevel returned a repeating pagination link; audience loading stopped to avoid an incomplete send.");
      }
      visitedUrls.add(nextUrl);
      const body = await highLevelFetch(nextUrl);
      contacts.push(...(Array.isArray(body?.contacts) ? body.contacts : []));
      nextUrl = typeof body?.meta?.nextPageUrl === "string" && body.meta.nextPageUrl ? body.meta.nextPageUrl : null;
    }
    highLevelContactsCache = {
      contacts,
      expiresAt: Date.now() + HIGHLEVEL_CONTACT_CACHE_MS,
    };
    return contacts;
  })().finally(() => {
    highLevelContactsRequest = undefined;
  });

  return highLevelContactsRequest;
}

export function warmHighLevelContacts() {
  void getAllHighLevelContacts().catch((error) => {
    console.warn("[ArticleCampaign] HighLevel audience warm-up failed:", error.message || error);
  });
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
  const contacts = await getAllHighLevelContacts();
  const seen = new Set<string>();
  return contacts
    .filter((contact) => contactHasTag(contact, tag) && typeof contact.email === "string" && contact.email.includes("@"))
    .filter((contact) => {
      const emailSettings = contact.dndSettings?.Email || contact.dndSettings?.email;
      const emailStatus = String(emailSettings?.status || "").toLowerCase();
      return contact.dnd !== true &&
        contact.emailDnd !== true &&
        !["active", "unsubscribed", "bounced", "complaint", "spam"].includes(emailStatus);
    })
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

export async function getCustomerAudienceOptions() {
  const [allCustomers, allUsers] = await Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers)
      .where(eq(customers.active, true))
      .orderBy(customers.name),
    db.select({
      id: customerUsers.id,
      customerId: customerUsers.customerId,
      email: customerUsers.email,
      firstName: customerUsers.firstName,
      lastName: customerUsers.lastName,
    }).from(customerUsers).where(eq(customerUsers.active, true)),
  ]);
  return allCustomers.map((customer) => ({
    ...customer,
    users: allUsers
      .filter((user) => user.customerId === customer.id && user.email)
      .map(({ customerId: _customerId, ...user }) => user),
  })).filter((customer) => customer.users.length > 0);
}

async function getExistingCustomerRecipients(selection: CampaignAudienceSelection): Promise<HighLevelContact[]> {
  const options = await getCustomerAudienceOptions();
  const selectedCustomers = new Set(selection.selectedCustomerIds);
  const excludedUsers = new Set(selection.excludedCustomerUserIds);
  const seen = new Set<string>();
  return options
    .filter((customer) => selection.customerSelectionMode === "all" || selectedCustomers.has(customer.id))
    .flatMap((customer) => customer.users)
    .filter((user) => !excludedUsers.has(user.id))
    .filter((user) => {
      const email = user.email.trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    })
    .map((user) => ({
      id: user.id,
      email: user.email.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      tags: [],
    }));
}

function mergeUniqueRecipients(...groups: HighLevelContact[][]): HighLevelContact[] {
  const seen = new Set<string>();
  return groups.flat().filter((recipient) => {
    const email = recipient.email.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

export async function getCampaignArticles(): Promise<KnowledgeCentreArticle[]> {
  const external = await getExternalKnowledgeCentreArticles();
  return [...external, ...KNOWLEDGE_CENTRE_ARTICLES].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export async function getCampaignArticleAvailability() {
  const articles = await getCampaignArticles();
  const cutoff = new Date(Date.now() - ARTICLE_COOLDOWN_MS);
  const recentRuns = await db.select({
    articleSlug: weeklyArticleCampaignRuns.articleSlug,
    startedAt: weeklyArticleCampaignRuns.startedAt,
    finishedAt: weeklyArticleCampaignRuns.finishedAt,
  }).from(weeklyArticleCampaignRuns).where(and(
    eq(weeklyArticleCampaignRuns.campaignId, CAMPAIGN_ID),
    gt(weeklyArticleCampaignRuns.sentCount, 0),
    gte(weeklyArticleCampaignRuns.startedAt, cutoff),
  ));
  const lastSentBySlug = new Map<string, Date>();
  for (const run of recentRuns) {
    const sentAt = run.finishedAt || run.startedAt;
    const current = lastSentBySlug.get(run.articleSlug);
    if (!current || sentAt > current) lastSentBySlug.set(run.articleSlug, sentAt);
  }
  return articles.map((article) => {
    const lastSentAt = lastSentBySlug.get(article.slug) || null;
    return {
      ...article,
      lastSentAt: lastSentAt?.toISOString() || null,
      eligible: !lastSentAt,
    };
  });
}

export async function getCampaignConfig() {
  const [row] = await db.select().from(weeklyArticleCampaigns).where(eq(weeklyArticleCampaigns.id, CAMPAIGN_ID));
  return row || {
    id: CAMPAIGN_ID,
    enabled: false,
    audienceSource: "highlevel_tag",
    tagId: null,
    tagName: null,
    customerSelectionMode: "all",
    selectedCustomerIds: [],
    excludedCustomerUserIds: [],
    articleSlug: null,
    subject: null,
    intro: "",
    updatedById: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function saveCampaignConfig(input: {
  enabled: boolean;
  audienceSource: string;
  tagId: string;
  tagName: string;
  customerSelectionMode: string;
  selectedCustomerIds: string[];
  excludedCustomerUserIds: string[];
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

async function resolveSelection(
  tagId: string,
  articleSlug: string,
  audienceSource = "highlevel_tag",
  options: { allowRecentlySent?: boolean } = {},
) {
  const articles = await getCampaignArticleAvailability();
  const article = articles.find((item) => item.slug === articleSlug);
  if (!article) throw new Error("The selected article no longer exists.");
  if (!article.eligible && !options.allowRecentlySent) {
    throw new Error("This article was sent within the last 16 weeks. Please choose another article.");
  }
  if (audienceSource === "customers") {
    return { tag: { id: "existing-customers", name: "Existing customers" }, article };
  }
  const tags = await getHighLevelTags();
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) throw new Error("The selected HighLevel tag no longer exists.");
  return { tag, article };
}

async function getAudienceRecipients(selection: CampaignAudienceSelection, tag: HighLevelTag) {
  if (selection.audienceSource === "customers") {
    return filterArticleCampaignRecipients(await getExistingCustomerRecipients(selection));
  }

  // Portal users are always part of an article campaign. The selected
  // HighLevel tag adds contacts outside the portal, while the merge prevents
  // anyone with both records from receiving two copies.
  const [tagRecipients, portalRecipients] = await Promise.all([
    getHighLevelContactsByTag(tag),
    getExistingCustomerRecipients({
      audienceSource: "customers",
      customerSelectionMode: "all",
      selectedCustomerIds: [],
      excludedCustomerUserIds: [],
    }),
  ]);
  return filterArticleCampaignRecipients(mergeUniqueRecipients(tagRecipients, portalRecipients));
}

async function getRunBySlot(slotKey: string) {
  const [run] = await db.select().from(weeklyArticleCampaignRuns)
    .where(eq(weeklyArticleCampaignRuns.slotKey, slotKey));
  return run;
}

async function insertRun(slotKey: string, config: Awaited<ReturnType<typeof getCampaignConfig>>, tag: HighLevelTag, article: KnowledgeCentreArticle) {
  const [run] = await db.insert(weeklyArticleCampaignRuns).values({
    campaignId: CAMPAIGN_ID,
    slotKey,
    audienceSource: config.audienceSource,
    tagId: tag.id,
    tagName: tag.name,
    customerSelectionMode: config.customerSelectionMode,
    selectedCustomerIds: config.selectedCustomerIds,
    excludedCustomerUserIds: config.excludedCustomerUserIds,
    articleSlug: article.slug,
    articleTitle: article.title,
    subject: article.title,
    intro: config.intro,
  }).onConflictDoNothing({ target: weeklyArticleCampaignRuns.slotKey }).returning();
  return run || getRunBySlot(slotKey);
}

async function getRecipientsForRun(runId: string) {
  return db.select().from(weeklyArticleCampaignRecipients)
    .where(eq(weeklyArticleCampaignRecipients.runId, runId));
}

async function populateRecipients(runId: string, contacts: HighLevelContact[]) {
  const values = contacts.map((contact) => ({
    runId,
    email: contact.email.trim().toLowerCase(),
    firstName: contact.firstName,
  }));
  for (let offset = 0; offset < values.length; offset += 500) {
    const chunk = values.slice(offset, offset + 500);
    if (chunk.length) {
      await db.insert(weeklyArticleCampaignRecipients).values(chunk)
        .onConflictDoNothing({ target: [weeklyArticleCampaignRecipients.runId, weeklyArticleCampaignRecipients.email] });
    }
  }
}

function articleUrl(article: KnowledgeCentreArticle) {
  return `https://www.selectbranding.co.uk/knowledge-centre/${article.slug}`;
}

export async function buildCampaignPreview(input: CampaignAudienceSelection & { tagId: string; articleSlug: string }) {
  const { tag, article } = await resolveSelection(input.tagId, input.articleSlug, input.audienceSource);
  const contacts = await getAudienceRecipients(input, tag);
  return {
    recipientCount: contacts.length,
    tag,
    article,
    html: buildArticleCampaignEmailHtml({
      articleTitle: article.title,
      articleExcerpt: article.excerpt,
      articleUrl: articleUrl(article),
      imageUrl: article.imageUrl,
      unsubscribeUrl: articleCampaignUnsubscribeUrl("preview@selectbranding.co.uk"),
    }),
  };
}

export async function sendCampaignTest(input: { to: string; subject: string; tagId: string; articleSlug: string; audienceSource: string }) {
  const { article } = await resolveSelection(input.tagId, input.articleSlug, input.audienceSource);
  await sendArticleCampaignEmail({
    to: input.to,
    subject: article.title,
    articleTitle: article.title,
    articleExcerpt: article.excerpt,
    articleUrl: articleUrl(article),
    imageUrl: article.imageUrl,
  });
}

async function runScheduledCampaign(slotKey: string) {
  const config = await getCampaignConfig();
  if (!config.enabled || !config.articleSlug || !config.subject) return;
  if (config.audienceSource === "highlevel_tag" && (!config.tagId || !config.tagName)) return;
  const existing = await getRunBySlot(slotKey);
  if (existing && existing.status !== "sending") return;
  let run = existing;
  try {
    const { tag, article } = existing
      ? await resolveSelection(existing.tagId, existing.articleSlug, existing.audienceSource, { allowRecentlySent: true })
      : await resolveSelection(config.tagId || "", config.articleSlug, config.audienceSource);
    run = run || await insertRun(slotKey, config, tag, article);
    if (!run) throw new Error("Could not claim the campaign run.");
    let recipients = await getRecipientsForRun(run.id);
    if (recipients.length === 0) {
      const selection = {
        audienceSource: run.audienceSource as CampaignAudienceSelection["audienceSource"],
        customerSelectionMode: run.customerSelectionMode as CampaignAudienceSelection["customerSelectionMode"],
        selectedCustomerIds: run.selectedCustomerIds,
        excludedCustomerUserIds: run.excludedCustomerUserIds,
      };
      const contacts = await getAudienceRecipients(selection, tag);
      await populateRecipients(run.id, contacts);
      recipients = await getRecipientsForRun(run.id);
    }
    const staleClaimCutoff = new Date(Date.now() - 30 * 60 * 1000);
    await db.update(weeklyArticleCampaignRecipients).set({ status: "pending", claimedAt: null })
      .where(and(
        eq(weeklyArticleCampaignRecipients.runId, run.id),
        eq(weeklyArticleCampaignRecipients.status, "sending"),
        lt(weeklyArticleCampaignRecipients.claimedAt, staleClaimCutoff),
      ));
    for (const recipient of recipients.filter((item) => item.status === "pending")) {
      const [claimedRecipient] = await db.update(weeklyArticleCampaignRecipients).set({
        status: "sending",
        claimedAt: new Date(),
      }).where(and(
        eq(weeklyArticleCampaignRecipients.id, recipient.id),
        eq(weeklyArticleCampaignRecipients.status, "pending"),
      )).returning();
      if (!claimedRecipient) continue;
      try {
        if (await isEmailPermanentlyFailed(claimedRecipient.email)) {
          await db.update(weeklyArticleCampaignRecipients).set({
            status: "suppressed",
            claimedAt: null,
            error: "Skipped because this address previously had a permanent delivery failure.",
          }).where(eq(weeklyArticleCampaignRecipients.id, claimedRecipient.id));
          continue;
        }
        if (await isArticleCampaignUnsubscribed(claimedRecipient.email)) {
          await db.update(weeklyArticleCampaignRecipients).set({
            status: "unsubscribed",
            claimedAt: null,
            error: null,
          }).where(eq(weeklyArticleCampaignRecipients.id, claimedRecipient.id));
          continue;
        }
        await sendArticleCampaignEmail({
          to: claimedRecipient.email,
          subject: run.subject,
          articleTitle: article.title,
          articleExcerpt: article.excerpt,
          articleUrl: articleUrl(article),
          imageUrl: article.imageUrl,
        });
        await db.update(weeklyArticleCampaignRecipients).set({ status: "sent", sentAt: new Date(), claimedAt: null, error: null })
          .where(eq(weeklyArticleCampaignRecipients.id, claimedRecipient.id));
      } catch (error: any) {
        if (error?.permanent === true) {
          await recordPermanentEmailFailure(claimedRecipient.email, error);
        }
        await db.update(weeklyArticleCampaignRecipients).set({
          status: "failed",
          claimedAt: null,
          error: String(error?.message || "send failed").slice(0, 500),
        }).where(eq(weeklyArticleCampaignRecipients.id, claimedRecipient.id));
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const finalRecipients = await getRecipientsForRun(run.id);
    const sent = finalRecipients.filter((item) => item.status === "sent").length;
    const failures = finalRecipients.filter((item) => item.status === "failed");
    await db.update(weeklyArticleCampaignRuns).set({
      status: failures.length ? (sent ? "partial" : "failed") : "sent",
      recipientCount: finalRecipients.length,
      sentCount: sent,
      failedCount: failures.length,
      failures: failures.map((item) => `${item.email}: ${item.error || "send failed"}`).slice(0, 50),
      finishedAt: new Date(),
    }).where(eq(weeklyArticleCampaignRuns.id, run.id));
  } catch (error: any) {
    if (run) {
      const finalRecipients = await getRecipientsForRun(run.id);
      await db.update(weeklyArticleCampaignRuns).set({
        status: "failed",
        recipientCount: finalRecipients.length,
        sentCount: finalRecipients.filter((item) => item.status === "sent").length,
        failedCount: finalRecipients.filter((item) => item.status === "failed").length,
        failures: [...finalRecipients.filter((item) => item.status === "failed").map((item) => `${item.email}: ${item.error || "send failed"}`), String(error?.message || error)].slice(0, 50),
        finishedAt: new Date(),
      }).where(eq(weeklyArticleCampaignRuns.id, run.id));
    }
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