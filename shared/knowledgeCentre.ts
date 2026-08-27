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

export const KNOWLEDGE_CENTRE_ARTICLES: KnowledgeCentreArticle[] = [
  {
    slug: "when-to-outsource-contract-embroidery",
    title: "When is contract embroidery the right move?",
    excerpt:
      "A practical guide to deciding whether extra embroidery capacity should come from your own workshop or a specialist production partner.",
    category: "Contract embroidery",
    publishedAt: "2026-08-20T09:00:00.000Z",
    readTime: "5 min read",
    source: "first-party",
    paragraphs: [
      "If embroidery is becoming the part of your order book that slows everything else down, outsourcing can give your sales team room to keep moving without committing to another machine or another operator.",
      "Contract embroidery is particularly useful when demand changes through the year, when recruitment is difficult, or when a growing branded-clothing business needs reliable production before it is ready for a larger workshop.",
      "The right partner should be able to explain capacity, lead times, quality checks, artwork approval and dispatch clearly. That gives you a repeatable production route rather than another supplier to chase.",
    ],
  },
  {
    slug: "preparing-artwork-for-embroidery",
    title: "How to prepare artwork for embroidery",
    excerpt:
      "The artwork decisions that affect stitch quality, approval time and the finished look on workwear, sportswear and uniforms.",
    category: "Embroidery advice",
    publishedAt: "2026-08-13T09:00:00.000Z",
    readTime: "4 min read",
    source: "first-party",
    paragraphs: [
      "Embroidery is built from stitches rather than pixels, so the best starting point is clear artwork with strong shapes, readable lettering and enough contrast for the garment colour.",
      "Small details and fine text may need simplifying during digitising. A good sew-out approval gives you the chance to review those choices on fabric before the full production run starts.",
      "When sending artwork, include the intended garment, decoration position and finished size if you know them. Those details help the production team recommend a practical stitch plan.",
    ],
  },
  {
    slug: "embroidery-or-print",
    title: "Embroidery or print: which is right for your garments?",
    excerpt:
      "A straightforward comparison of the two decoration methods, including when each one works best for branded clothing.",
    category: "Garment branding",
    publishedAt: "2026-08-06T09:00:00.000Z",
    readTime: "4 min read",
    source: "first-party",
    paragraphs: [
      "Embroidery is a strong choice for durable workwear, polos, jackets and uniforms where a raised, hard-wearing finish is part of the look.",
      "Print can be the better option for large artwork, gradients, very fine detail or designs where a smooth and lightweight finish matters more than texture.",
      "The decision also depends on the garment, position, quantity and how the clothing will be used. Sharing the full brief lets the production team recommend the best route instead of treating every logo the same way.",
    ],
  },
  {
    slug: "planning-reliable-embroidery-lead-times",
    title: "Planning reliable embroidery lead times",
    excerpt:
      "How suppliers can reduce last-minute production pressure by giving embroidery a clear place in the order process.",
    category: "Production planning",
    publishedAt: "2026-07-30T09:00:00.000Z",
    readTime: "5 min read",
    source: "first-party",
    paragraphs: [
      "Lead times are easier to protect when artwork, garment quantities, decoration positions and required dispatch dates are confirmed before production is booked.",
      "For repeat work, keeping approved artwork and decoration instructions easy to find removes avoidable questions from every new order. It also makes it easier to spot when a new sew-out is genuinely needed.",
      "A production partner should give you a clear route from booking to approval, production, quality checking and dispatch. That visibility helps you set expectations with your own customer before the deadline becomes urgent.",
    ],
  },
];

export function getKnowledgeCentreArticle(slug: string) {
  return KNOWLEDGE_CENTRE_ARTICLES.find((article) => article.slug === slug);
}