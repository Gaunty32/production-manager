import { XMLParser } from "fast-xml-parser";
import type { KnowledgeCentreArticle } from "@shared/knowledgeCentre";

export const EXTERNAL_KNOWLEDGE_FEED_URL =
  "https://app.trysoro.com/api/rss/1ebbb826-bfa1-41de-854c-6dbf82125bf4";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

let cache: { expiresAt: number; articles: KnowledgeCentreArticle[] } | undefined;

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return textValue(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record["#text"] ?? record["@_href"] ?? "");
  }
  return "";
}

function stripMarkup(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `external-${slug || "article"}`;
}

function toArticle(item: Record<string, unknown>): KnowledgeCentreArticle | undefined {
  const title = textValue(item.title);
  const rawLink = textValue(item.link) || textValue(item.guid);
  if (!title || !rawLink) return undefined;

  let url: string;
  try {
    url = new URL(rawLink, EXTERNAL_KNOWLEDGE_FEED_URL).toString();
  } catch {
    return undefined;
  }

  const description = stripMarkup(
    textValue(item.description) ||
      textValue(item["content:encoded"]) ||
      textValue(item.content),
  );
  const pubDate = textValue(item.pubDate) || textValue(item.published);
  const parsedDate = Date.parse(pubDate);
  const publishedAt = Number.isNaN(parsedDate)
    ? new Date(0).toISOString()
    : new Date(parsedDate).toISOString();
  const wordCount = description ? description.split(/\s+/).length : 0;

  return {
    slug: slugify(title),
    title,
    excerpt: description || "Read the latest guidance from Select Branding Solutions.",
    category: textValue(item.category) || "Knowledge Centre",
    publishedAt,
    readTime: wordCount ? `${Math.max(1, Math.ceil(wordCount / 200))} min read` : "Read article",
    paragraphs: description ? [description] : [],
    url,
    source: "external",
  };
}

export async function getExternalKnowledgeCentreArticles(): Promise<KnowledgeCentreArticle[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.articles;

  try {
    const response = await fetch(EXTERNAL_KNOWLEDGE_FEED_URL, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`RSS request returned ${response.status}`);

    const xml = await response.text();
    const parsed = parser.parse(xml) as {
      rss?: { channel?: { item?: Record<string, unknown> | Record<string, unknown>[] } };
    };
    const rawItems = parsed.rss?.channel?.item;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const articles = items
      .map(toArticle)
      .filter((article): article is KnowledgeCentreArticle => Boolean(article));

    cache = { expiresAt: Date.now() + 10 * 60 * 1000, articles };
    return articles;
  } catch (error) {
    console.error("[KnowledgeCentre] External RSS import failed:", error);
    cache = { expiresAt: Date.now() + 60 * 1000, articles: [] };
    return [];
  }
}