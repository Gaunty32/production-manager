import assert from "node:assert/strict";
import { test } from "node:test";
import { getExternalKnowledgeCentreArticles } from "./knowledgeCentreFeed";

test("strict article sharing parses real prose and fails closed rather than treating feed errors as an empty baseline", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(`<rss><channel><item>
      <title>Example article</title><link>https://example.com/article</link>
      <pubDate>Thu, 26 Nov 2026 03:00:00 GMT</pubDate>
      <description>Short summary</description>
      <content:encoded><![CDATA[<h2>A heading</h2><p>The actual &amp; complete first paragraph.</p><h3>Not a paragraph</h3><p>More prose.</p><p>Third paragraph.</p>]]></content:encoded>
      <media:content url="https://images.example.com/article.webp" medium="image"/>
    </item></channel></rss>`, { status: 200 })) as typeof fetch;
    const articles = await getExternalKnowledgeCentreArticles({ strict: true, force: true });
    assert.equal(articles[0].firstParagraph, "The actual & complete first paragraph.");
    assert.deepEqual(articles[0].openingParagraphs, ["The actual & complete first paragraph.", "More prose."]);
    assert.equal(articles[0].imageUrl, "https://images.example.com/article.webp");
    assert.equal(articles[0].paragraphs[0], "A heading", "Existing article display behaviour is unchanged");
    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    await assert.rejects(getExternalKnowledgeCentreArticles({ strict: true, force: true }), /503/);
    await assert.rejects(getExternalKnowledgeCentreArticles({ strict: true }), /503/);
    globalThis.fetch = (async () => new Response("<rss><channel/></rss>")) as typeof fetch;
    await assert.rejects(getExternalKnowledgeCentreArticles({ strict: true, force: true }), /no articles/);
  } finally { globalThis.fetch = originalFetch; }
});
