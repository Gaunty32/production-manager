import { createHash } from "node:crypto";
import type { KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import type { FacebookArticlePreview } from "@shared/facebookArticleSharing";

const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function articlePlainText(value: string) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? whole;
      const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : whole;
    }).replace(/\s+/g, " ").trim();
}

/** A heading is never a substitute for the first prose paragraph. */
export function firstProseParagraph(content: string, description = ""): string | undefined {
  const source = content.trim() || description.trim();
  for (const match of Array.from(source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))) {
    const text = articlePlainText(match[1]);
    if (text) return text;
  }
  if (/<[a-z][^>]*>/i.test(source)) return undefined;
  return articlePlainText(source.split(/\n\s*\n/)[0] || "") || undefined;
}

export function canonicalArticleLink(article: KnowledgeCentreArticle) {
  return `https://www.selectbranding.co.uk/knowledge-centre/${encodeURIComponent(article.slug)}`;
}

export function normalizedArticleUrl(value: string) {
  try {
    let url = new URL(value);
    if (url.hostname === "l.facebook.com" && url.searchParams.get("u")) url = new URL(url.searchParams.get("u")!);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.protocol = "https:";
    url.hash = "";
    for (const name of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch { return ""; }
}

export function articleKey(article: KnowledgeCentreArticle) {
  return createHash("sha256").update(normalizedArticleUrl(article.url || "") || canonicalArticleLink(article)).digest("hex");
}

export function buildFacebookArticlePreview(article: KnowledgeCentreArticle): FacebookArticlePreview {
  const paragraph = article.source === "external" ? article.firstParagraph : (article.firstParagraph || article.paragraphs[0]);
  if (!paragraph?.trim()) throw new Error("The article has no first prose paragraph; nothing was posted.");
  let image: URL;
  try { image = new URL(article.imageUrl || ""); } catch { throw new Error("The article image is missing; nothing was posted."); }
  if (image.protocol !== "https:" || image.username || image.password) throw new Error("The article needs a public HTTPS image; nothing was posted.");
  const articleUrl = canonicalArticleLink(article);
  const title = articlePlainText(article.title);
  const prose = articlePlainText(paragraph);
  if (!title || !prose) throw new Error("The article title or paragraph is empty; nothing was posted.");
  const message = `${title}\n\n${prose}\n\nRead more: ${articleUrl}`;
  if (message.length > 60_000) throw new Error("The article's first paragraph is too long for a Facebook caption.");
  return { title, paragraph: prose, articleUrl, imageUrl: image.toString(), message };
}

export interface ExistingFacebookPost {
  id: string;
  message?: string;
  urls: string[];
}

function comparableText(text: string) {
  return articlePlainText(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(new RegExp("[^\\p{L}\\p{N}]+", "gu"), " ").trim();
}

/** Recognise definite matches, not unrelated posts that merely link to our homepage. */
export function findExistingArticlePost(article: KnowledgeCentreArticle, posts: ExistingFacebookPost[]) {
  const links = new Set([canonicalArticleLink(article), article.url || ""].map(normalizedArticleUrl).filter(Boolean));
  const title = comparableText(article.title);
  const paragraph = comparableText(article.firstParagraph || "").slice(0, 140);
  return posts.find(post => {
    const foundLinks = [...post.urls, ...(post.message?.match(/https?:\/\/[^\s<>"]+/g) || [])];
    if (foundLinks.some(link => links.has(normalizedArticleUrl(link.replace(/[).,]+$/, ""))))) return true;
    const message = comparableText(post.message || "");
    return (title.length >= 20 && message.includes(title)) || (paragraph.length >= 100 && message.includes(paragraph));
  });
}

export function londonClock(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
