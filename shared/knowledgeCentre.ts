export type KnowledgeCentreArticle = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readTime: string;
  paragraphs: string[];
  url?: string;
  imageUrl?: string;
  source?: "first-party" | "external";
};

// The Knowledge Centre is populated from the connected Soro RSS feed.
// Keep this export for compatibility with existing imports and as a fallback
// extension point, but do not duplicate feed articles here.
export const KNOWLEDGE_CENTRE_ARTICLES: KnowledgeCentreArticle[] = [];

export function getKnowledgeCentreArticle(slug: string) {
  return KNOWLEDGE_CENTRE_ARTICLES.find((article) => article.slug === slug);
}