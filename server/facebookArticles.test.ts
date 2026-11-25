import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import type { FacebookArticleRecord, FacebookArticlePreview } from "@shared/facebookArticleSharing";
import {
  articleKey, buildFacebookArticlePreview, canonicalArticleLink, findExistingArticlePost,
  firstProseParagraph, londonClock, type ExistingFacebookPost,
} from "./facebookArticleRules";
import { FacebookPageClient, FacebookRequestError } from "./facebookPageClient";
import {
  checkFacebookArticles, newFacebookSharingState, type FacebookSharingState,
  type FacebookSharingStore, type FacebookDeliveryDependencies,
} from "./facebookArticleDelivery";

const article = (changes: Partial<KnowledgeCentreArticle> = {}): KnowledgeCentreArticle => ({
  slug: "external-example-guide", title: "A practical embroidery production guide",
  excerpt: "This is not the first paragraph.", category: "Knowledge Centre", source: "external",
  paragraphs: ["A heading", "The first actual paragraph."], firstParagraph: "The first actual paragraph.",
  imageUrl: "https://images.example.com/article.webp", publishedAt: "2026-11-26T03:00:00Z",
  readTime: "3 min read", url: "https://www.selectbranding.co.uk/example-guide", ...changes,
});

class MemoryStore implements FacebookSharingStore {
  state: FacebookSharingState = newFacebookSharingState();
  entries = new Map<string, FacebookArticleRecord>();
  failPublishedSave = false;
  async read() { return structuredClone(this.state); }
  async mutate<T>(change: (state: FacebookSharingState) => T): Promise<T> { return change(this.state); }
  async record(key: string) { return structuredClone(this.entries.get(key) || null); }
  async saveRecord(record: FacebookArticleRecord, owner: string) {
    if (this.state.owner !== owner) throw new Error("Another instance has taken over the Facebook check.");
    if (this.failPublishedSave && record.status === "published") {
      this.failPublishedSave = false; throw new Error("Database write interrupted after provider acceptance");
    }
    this.entries.set(record.key, structuredClone(record));
  }
  async claimRecord(record: FacebookArticleRecord, owner: string) {
    if (this.state.owner !== owner) return false;
    const previous = this.entries.get(record.key);
    if (previous && ["published", "already_shared", "publishing", "review", "rejected"].includes(previous.status)) return false;
    await this.saveRecord(record, owner);
    return true;
  }
  async records() { return Array.from(this.entries.values()); }
}

function fixture(enabled = true) {
  const store = new MemoryStore();
  const old = article({ slug: "old", url: "https://www.selectbranding.co.uk/old", publishedAt: "2026-11-20T03:00:00Z" });
  store.state = {
    ...newFacebookSharingState(), enabled, soroSharingStopped: enabled,
    activatedAt: "2026-11-25T09:00:00Z", initializedAt: "2026-11-25T09:00:00Z", baselineKeys: [articleKey(old)],
  };
  let feed = [old, article()];
  let posts: ExistingFacebookPost[] = [];
  const sends: FacebookArticlePreview[] = [];
  const deps: FacebookDeliveryDependencies = {
    store, clock: () => new Date("2026-11-26T09:05:00Z"), articles: async () => feed,
    page: {
      verify: async () => ({ id: "123", name: "Company Page" }),
      postsSince: async () => posts,
      publish: async preview => {
        assert.equal(store.entries.get(articleKey(feed[1]))?.status, "publishing", "A durable marker precedes the provider call");
        sends.push(preview);
        return "123_confirmed";
      },
    },
  };
  return { store, deps, sends, setFeed: (value: KnowledgeCentreArticle[]) => { feed = value; }, setPosts: (value: ExistingFacebookPost[]) => { posts = value; } };
}

test("sharing extracts the first actual paragraph, skipping headings and decoding HTML", () => {
  assert.equal(firstProseParagraph("<h2>A heading</h2><p><img src='x'></p><p>Actual <strong>prose</strong> &amp; &#x1F600;.</p>"), "Actual prose & 😀.");
  assert.equal(firstProseParagraph("<h2>Only a heading</h2>"), undefined);
  assert.equal(firstProseParagraph("", "Plain description"), "Plain description");
  assert.equal(firstProseParagraph("First prose.\n\nSecond prose."), "First prose.");
});

test("the Facebook caption has the image, full first paragraph and direct company Knowledge Centre link", () => {
  const preview = buildFacebookArticlePreview(article());
  assert.equal(preview.paragraph, "The first actual paragraph.");
  assert.equal(preview.articleUrl, "https://www.selectbranding.co.uk/knowledge-centre/external-example-guide");
  assert.equal(preview.imageUrl, article().imageUrl);
  assert.ok(preview.message.endsWith(`Read more: ${preview.articleUrl}`));
  assert.ok(!preview.message.includes(article().excerpt));
  assert.ok(!preview.message.includes("A heading"));
  assert.throws(() => buildFacebookArticlePreview(article({ firstParagraph: undefined })), /first prose/);
  assert.throws(() => buildFacebookArticlePreview(article({ imageUrl: undefined })), /image/);
  assert.throws(() => buildFacebookArticlePreview(article({ imageUrl: "http://example.com/image.jpg" })), /HTTPS/);
});

test("article identity ignores tracking parameters and title changes", () => {
  assert.equal(articleKey(article()), articleKey(article({ title: "An updated title", url: `${article().url}?utm_source=facebook&fbclid=example` })));
});

test("recognisable Facebook shares match links, titles or actual prose, never a generic homepage", () => {
  const current = article();
  assert.equal(findExistingArticlePost(current, [{ id: "1", urls: [`${canonicalArticleLink(current)}?utm_source=soro`] }])?.id, "1");
  assert.equal(findExistingArticlePost(current, [{ id: "2", message: `New: ${current.title.toUpperCase()}!`, urls: [] }])?.id, "2");
  assert.equal(findExistingArticlePost(current, [{ id: "3", message: "Generic rewritten text. https://www.selectbranding.co.uk", urls: [] }]), undefined);
});

test("the schedule uses UK local time across daylight saving", () => {
  assert.deepEqual(londonClock(new Date("2026-07-01T08:00:00Z")), { day: "2026-07-01", hour: 9 });
  assert.deepEqual(londonClock(new Date("2026-11-26T08:59:00Z")), { day: "2026-11-26", hour: 8 });
});

test("first-run baseline excludes every existing article and never publishes", async () => {
  const f = fixture();
  f.store.state = newFacebookSharingState();
  await checkFacebookArticles(f.deps, { allowPublish: true, scheduled: true });
  assert.equal(f.sends.length, 0);
  assert.equal(f.store.state.baselineKeys.length, 2);
  assert.ok(f.store.state.initializedAt);
});

test("new articles publish once with durable history, even with concurrent instances", async () => {
  const f = fixture();
  await Promise.all([
    checkFacebookArticles(f.deps, { allowPublish: true, scheduled: true }),
    checkFacebookArticles(f.deps, { allowPublish: true, scheduled: true }),
  ]);
  await checkFacebookArticles(f.deps, { allowPublish: true, scheduled: true });
  assert.equal(f.sends.length, 1);
  assert.equal(f.store.entries.get(articleKey(article()))?.status, "published");
});

test("read-only checks, paused publishing and missing Soro confirmation never post", async () => {
  for (const mode of ["read-only", "paused", "unconfirmed"]) {
    const f = fixture();
    if (mode === "paused") f.store.state.enabled = false;
    if (mode === "unconfirmed") f.store.state.soroSharingStopped = false;
    await checkFacebookArticles(f.deps, { allowPublish: mode !== "read-only" });
    assert.equal(f.sends.length, 0);
    assert.ok(f.store.state.preview);
  }
});

test("a worker that loses ownership before committing the send marker cannot publish", async () => {
  const f = fixture();
  const claim = f.store.claimRecord.bind(f.store);
  f.store.claimRecord = async (record, owner) => {
    f.store.state.owner = "replacement-instance";
    return claim(record, owner);
  };
  await assert.rejects(checkFacebookArticles(f.deps, { allowPublish: true }), /taken over/);
  assert.equal(f.sends.length, 0);
  assert.equal(f.store.state.owner, "replacement-instance");
  assert.equal(await f.store.record(articleKey(article())), null);
});

test("an article already shared on Facebook is recorded and skipped", async () => {
  const f = fixture();
  f.setPosts([{ id: "123_existing", message: `Read more: ${canonicalArticleLink(article())}`, urls: [] }]);
  await checkFacebookArticles(f.deps, { allowPublish: true });
  assert.equal(f.sends.length, 0);
  assert.equal(f.store.entries.get(articleKey(article()))?.status, "already_shared");
});

test("uncertain publication is held, never blindly resent, and can be reconciled from Facebook", async () => {
  const f = fixture();
  f.deps.page.publish = async preview => {
    f.sends.push(preview); throw new FacebookRequestError("Provider response timed out", true);
  };
  await checkFacebookArticles(f.deps, { allowPublish: true });
  await checkFacebookArticles(f.deps, { allowPublish: true });
  assert.equal(f.sends.length, 1);
  assert.equal(f.store.entries.get(articleKey(article()))?.status, "review");
  f.setPosts([{ id: "123_recovered", urls: [canonicalArticleLink(article())] }]);
  await checkFacebookArticles(f.deps, { allowPublish: true });
  assert.equal(f.sends.length, 1);
  assert.equal(f.store.entries.get(articleKey(article()))?.status, "already_shared");
});

test("a crash between provider acceptance and history persistence cannot cause a resend", async () => {
  const f = fixture();
  f.store.failPublishedSave = true;
  await checkFacebookArticles(f.deps, { allowPublish: true });
  await checkFacebookArticles(f.deps, { allowPublish: true });
  assert.equal(f.sends.length, 1);
  assert.equal(f.store.entries.get(articleKey(article()))?.status, "review");
});

test("rejected publications wait for explicit retry authorisation", async () => {
  const f = fixture();
  f.deps.page.publish = async preview => { f.sends.push(preview); throw new FacebookRequestError("Permission denied", false); };
  await checkFacebookArticles(f.deps, { allowPublish: true });
  await checkFacebookArticles(f.deps, { allowPublish: true });
  assert.equal(f.sends.length, 1);
  assert.equal(f.store.entries.get(articleKey(article()))?.status, "rejected");
});

test("missing images and missing paragraphs are held without text-only fallback", async () => {
  for (const missing of [{ imageUrl: undefined }, { firstParagraph: undefined }]) {
    const f = fixture();
    f.setFeed([article({ ...missing, url: "https://example.com/new", slug: "new" })]);
    await checkFacebookArticles(f.deps, { allowPublish: true });
    assert.equal(f.sends.length, 0);
    assert.equal((await f.store.records())[0]?.status, "blocked");
  }
});

test("old, undated and future feed entries are not accidentally backfilled", async () => {
  for (const publishedAt of ["2026-01-01T03:00:00Z", "2026-11-25T08:59:00Z", "1970-01-01T00:00:00Z", "2026-11-27T03:00:00Z"]) {
    const f = fixture();
    f.setFeed([article({ publishedAt })]);
    await checkFacebookArticles(f.deps, { allowPublish: true });
    assert.equal(f.sends.length, 0);
  }
});

test("feed and Facebook read failures fail closed and release the check lease", async () => {
  for (const failure of ["feed", "facebook"]) {
    const f = fixture();
    if (failure === "feed") f.deps.articles = async () => { throw new Error("RSS unavailable"); };
    else f.deps.page.postsSince = async () => { throw new Error("Page list incomplete"); };
    await assert.rejects(checkFacebookArticles(f.deps, { allowPublish: true }));
    assert.equal(f.sends.length, 0);
    assert.equal(f.store.state.owner, undefined);
    assert.ok(f.store.state.lastError);
  }
});

test("scheduled checks wait until 09:00 and catch up after an app restart", async () => {
  const f = fixture();
  f.deps.clock = () => new Date("2026-11-26T08:59:00Z");
  await checkFacebookArticles(f.deps, { allowPublish: true, scheduled: true });
  assert.equal(f.sends.length, 0);
  f.deps.clock = () => new Date("2026-11-26T14:00:00Z");
  await checkFacebookArticles(f.deps, { allowPublish: true, scheduled: true });
  assert.equal(f.sends.length, 1);
});

test("the Page client verifies destination identity and never includes tokens in URLs", async () => {
  const page = new FacebookPageClient("123", "test-only-token", (async (url, init) => {
    assert.ok(!String(url).includes("test-only-token"));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only-token");
    return Response.json({ id: "456", name: "Wrong Page", category: "Business" });
  }) as typeof fetch);
  await assert.rejects(page.verify(), /configured company Page/);
});

test("post pagination checks every page without following untrusted provider URLs", async () => {
  let calls = 0;
  const page = new FacebookPageClient("123", "test-only-token", (async url => {
    calls++;
    assert.equal(new URL(String(url)).hostname, "graph.facebook.com");
    if (calls === 1) return Response.json({
      data: [{ id: "123_1", message: "One" }],
      paging: { next: "https://untrusted.example/with-secret", cursors: { after: "cursor-two" } },
    });
    assert.equal(new URL(String(url)).searchParams.get("after"), "cursor-two");
    return Response.json({ data: [{ id: "123_2", message: "Two", attachments: { data: [{ target: { url: "https://example.com/article" } }] } }] });
  }) as typeof fetch);
  const posts = await page.postsSince("2026-11-25T09:00:00Z");
  assert.equal(calls, 2);
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].urls, ["https://example.com/article"]);
});

test("Facebook photo publication requires a confirmed post ID and preserves exact content", async () => {
  const preview = buildFacebookArticlePreview(article());
  const page = new FacebookPageClient("123", "test-only-token", (async (url, init) => {
    assert.ok(String(url).endsWith("/123/photos"));
    assert.deepEqual(JSON.parse(String(init?.body)), { url: preview.imageUrl, message: preview.message, published: "true" });
    return Response.json({ id: "photo-only" });
  }) as typeof fetch);
  await assert.rejects(page.publish(preview), (error: unknown) => error instanceof FacebookRequestError && error.uncertain);
});
