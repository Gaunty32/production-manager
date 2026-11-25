import { randomUUID } from "node:crypto";
import type { KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import type { FacebookArticlePreview, FacebookArticleRecord } from "@shared/facebookArticleSharing";
import { articleKey, buildFacebookArticlePreview, canonicalArticleLink, findExistingArticlePost, londonClock, type ExistingFacebookPost } from "./facebookArticleRules";
import { FacebookRequestError } from "./facebookPageClient";

export interface FacebookSharingState {
  enabled: boolean;
  soroSharingStopped: boolean;
  initializedAt: string | null;
  activatedAt: string | null;
  baselineKeys: string[];
  pageName: string | null;
  lastCheckedAt: string | null;
  lastScheduledDay: string | null;
  lastError: string | null;
  preview: FacebookArticlePreview | null;
  owner?: string;
  leaseUntil?: number;
}

export const newFacebookSharingState = (): FacebookSharingState => ({
  enabled: false, soroSharingStopped: false, initializedAt: null, activatedAt: null,
  baselineKeys: [], pageName: null, lastCheckedAt: null, lastScheduledDay: null, lastError: null, preview: null,
});

export interface FacebookSharingStore {
  read(): Promise<FacebookSharingState>;
  mutate<T>(change: (state: FacebookSharingState) => T): Promise<T>;
  record(key: string): Promise<FacebookArticleRecord | null>;
  saveRecord(record: FacebookArticleRecord, owner: string): Promise<void>;
  claimRecord(record: FacebookArticleRecord, owner: string): Promise<boolean>;
  records(): Promise<FacebookArticleRecord[]>;
}

export interface FacebookDeliveryDependencies {
  store: FacebookSharingStore;
  articles(): Promise<KnowledgeCentreArticle[]>;
  page: {
    verify(): Promise<{ id: string; name: string }>;
    postsSince(since: string): Promise<ExistingFacebookPost[]>;
    publish(preview: FacebookArticlePreview): Promise<string>;
  };
  clock?: () => Date;
}

const LEASE_MS = 10 * 60_000;
const terminal = new Set(["published", "already_shared"]);

/** Durable pre-send markers survive process death and ambiguous provider acceptance. */
export async function checkFacebookArticles(
  deps: FacebookDeliveryDependencies,
  options: { allowPublish: boolean; scheduled?: boolean },
) {
  const clock = deps.clock || (() => new Date());
  const owner = randomUUID();
  const started = clock();
  const today = londonClock(started);
  if (options.scheduled && today.hour < 9) return;
  const acquired = await deps.store.mutate(state => {
    if (options.scheduled && state.lastScheduledDay === today.day) return false;
    if (state.owner && (state.leaseUntil || 0) > started.getTime()) return false;
    state.owner = owner;
    state.leaseUntil = started.getTime() + LEASE_MS;
    return true;
  });
  if (!acquired) {
    if (!options.scheduled) throw new Error("A Facebook check is already running. Please wait for it to finish.");
    return;
  }
  const updateOwned = <T>(change: (state: FacebookSharingState) => T) => deps.store.mutate(state => {
    if (state.owner !== owner) throw new Error("Another instance has taken over the Facebook check.");
    state.leaseUntil = clock().getTime() + LEASE_MS;
    return change(state);
  });
  try {
    const articles = await deps.articles();
    if (!articles.length) throw new Error("The article feed is empty; no baseline or posts were saved.");
    const page = await deps.page.verify();
    await updateOwned(state => {
      state.pageName = page.name;
      if (!state.initializedAt) {
        state.initializedAt = started.toISOString();
        state.baselineKeys = articles.map(articleKey);
      }
      state.lastCheckedAt = clock().toISOString();
      // A safe example is available even when every existing article is excluded.
      try { state.preview = buildFacebookArticlePreview(articles[0]); } catch { state.preview = null; }
    });
    const state = await deps.store.read();
    if (!options.allowPublish || !state.enabled || !state.soroSharingStopped || !state.activatedAt) {
      await updateOwned(current => {
        current.lastError = null;
        if (options.scheduled) current.lastScheduledDay = today.day;
      });
      return;
    }
    const baseline = new Set(state.baselineKeys);
    const activatedAt = Date.parse(state.activatedAt);
    const candidates = articles.filter(article => !baseline.has(articleKey(article))).sort(
      (left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
    );
    // Reading must succeed completely before considering any publication.
    const lookBack = new Date(Date.parse(state.activatedAt) - 24 * 60 * 60_000).toISOString();
    const posts = candidates.length ? await deps.page.postsSince(lookBack) : [];
    const problems: string[] = [];
    for (const article of candidates) {
      const key = articleKey(article);
      const previous = await deps.store.record(key);
      if (previous && terminal.has(previous.status)) continue;
      const record: FacebookArticleRecord = {
        key, title: article.title, articleUrl: canonicalArticleLink(article),
        status: "blocked", updatedAt: clock().toISOString(),
      };
      const published = Date.parse(article.publishedAt);
      if (!Number.isFinite(published) || published <= 0) {
        record.error = "The article has no valid publication date; held to avoid posting historical content.";
        await deps.store.saveRecord(record, owner); problems.push(record.error); continue;
      }
      if (published > clock().getTime()) {
        record.error = "The article's publication date is in the future; held until a later daily check.";
        await deps.store.saveRecord(record, owner); problems.push(record.error); continue;
      }
      if (published < activatedAt) continue;
      const existing = findExistingArticlePost(article, posts);
      if (existing) {
        await deps.store.saveRecord({ ...record, status: "already_shared", facebookPostId: existing.id }, owner);
        continue;
      }
      if (previous && ["publishing", "review", "rejected"].includes(previous.status)) {
        await deps.store.saveRecord({
          ...previous, status: previous.status === "rejected" ? "rejected" : "review",
          updatedAt: clock().toISOString(),
          error: previous.error || "A previous publish was not confirmed. Check Facebook before authorising a retry.",
        }, owner);
        problems.push(`Check Facebook before retrying: ${article.title}`);
        continue;
      }
      let preview: FacebookArticlePreview;
      try { preview = buildFacebookArticlePreview(article); }
      catch (error) {
        record.error = error instanceof Error ? error.message : "The article is not ready to share.";
        await deps.store.saveRecord(record, owner); problems.push(record.error); continue;
      }
      const mayPublish = await updateOwned(current => current.enabled && current.soroSharingStopped);
      if (!mayPublish) break;
      // Commit before the external side effect: never lose this marker to a rollback.
      if (!await deps.store.claimRecord({ ...record, status: "publishing" }, owner)) break;
      try {
        const postId = await deps.page.publish(preview);
        await deps.store.saveRecord({ ...record, status: "published", facebookPostId: postId, updatedAt: clock().toISOString() }, owner);
        posts.push({ id: postId, message: preview.message, urls: [preview.articleUrl] });
      } catch (error) {
        // Even a local persistence failure after acceptance must never trigger a blind resend.
        const definiteRejection = error instanceof FacebookRequestError && !error.uncertain;
        const message = error instanceof Error ? error.message : "Facebook did not confirm publication.";
        await deps.store.saveRecord({ ...record, status: definiteRejection ? "rejected" : "review", error: message }, owner);
        problems.push(message);
        break;
      }
    }
    await updateOwned(current => {
      current.lastError = problems.length ? problems.slice(0, 5).join(" ") : null;
      if (options.scheduled) current.lastScheduledDay = today.day;
    });
  } catch (error) {
    await updateOwned(state => {
      state.lastCheckedAt = clock().toISOString();
      state.lastError = error instanceof Error ? error.message : "Facebook article check failed.";
    });
    throw error;
  } finally {
    await deps.store.mutate(state => {
      if (state.owner === owner) { delete state.owner; delete state.leaseUntil; }
    });
  }
}
