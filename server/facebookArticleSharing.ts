import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { FacebookSharingStatus } from "@shared/facebookArticleSharing";
import { checkFacebookArticles } from "./facebookArticleDelivery";
import { facebookArticleStore } from "./facebookArticleStore";
import { articleKey, buildFacebookArticlePreview } from "./facebookArticleRules";
import { FacebookPageClient } from "./facebookPageClient";
import { getExternalKnowledgeCentreArticles } from "./knowledgeCentreFeed";

const production = () => process.env.NODE_ENV === "production";
const articles = () => getExternalKnowledgeCentreArticles({ strict: true, force: true });

function services() {
  const pageId = process.env.FACEBOOK_PAGE_ID || "";
  return {
    pageId, store: facebookArticleStore(pageId),
    page: new FacebookPageClient(pageId, process.env.FACEBOOK_PAGE_ACCESS_TOKEN || ""), articles,
  };
}

export async function facebookSharingStatus(): Promise<FacebookSharingStatus> {
  const pageId = process.env.FACEBOOK_PAGE_ID || "";
  const configured = /^\d+$/.test(pageId) && !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const state = /^\d+$/.test(pageId) ? await facebookArticleStore(pageId).read() : null;
  return {
    enabled: state?.enabled || false, soroSharingStopped: state?.soroSharingStopped || false,
    development: !production(), schedule: "09:00", timeZone: "Europe/London",
    configured, pageId: pageId || null, pageName: state?.pageName || null,
    initializedAt: state?.initializedAt || null, activatedAt: state?.activatedAt || null,
    baselineCount: state?.baselineKeys.length || 0, lastCheckedAt: state?.lastCheckedAt || null,
    lastError: state?.lastError || null, preview: state?.preview || null,
    recent: /^\d+$/.test(pageId) ? await facebookArticleStore(pageId).records() : [],
  };
}

export function registerFacebookArticleSharing(app: Express, staffAuth: RequestHandler, superAdmin: RequestHandler) {
  const wrap = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await handler(req, res, next); }
    catch (error) {
      res.status(error instanceof z.ZodError ? 400 : 409).json({
        error: error instanceof z.ZodError ? "Check the article-sharing settings." : error instanceof Error ? error.message : "Facebook article sharing failed.",
      });
    }
  };
  const base = "/api/admin/facebook-articles";
  app.get(base, staffAuth, superAdmin, wrap(async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await facebookSharingStatus());
  }));
  app.post(`${base}/check`, staffAuth, superAdmin, wrap(async (_req, res) => {
    await checkFacebookArticles(services(), { allowPublish: false });
    res.json(await facebookSharingStatus());
  }));
  app.put(`${base}/config`, staffAuth, superAdmin, wrap(async (req, res) => {
    const input = z.object({ enabled: z.boolean(), soroSharingStopped: z.boolean() }).parse(req.body);
    if (input.enabled && !production()) throw new Error("Enable publishing on the live app after republishing. Development never publishes.");
    if (input.enabled && !input.soroSharingStopped) throw new Error("Confirm that Soro article auto-sharing is stopped before enabling this publisher.");
    const { store, page } = services();
    const verified = input.enabled ? await page.verify() : null;
    const current = await store.read();
    const baseline = input.enabled && !current.activatedAt ? await articles() : null;
    if (baseline && !baseline.length) throw new Error("No article baseline is available; publishing remains paused.");
    await store.mutate(state => {
      state.enabled = input.enabled;
      state.soroSharingStopped = input.soroSharingStopped;
      if (verified) state.pageName = verified.name;
      if (input.enabled && !state.activatedAt && baseline) {
        state.activatedAt = new Date().toISOString();
        state.initializedAt = state.activatedAt;
        state.baselineKeys = baseline.map(articleKey);
        try { state.preview = buildFacebookArticlePreview(baseline[0]); } catch { state.preview = null; }
      }
      state.lastScheduledDay = null;
      state.lastError = null;
    });
    res.json(await facebookSharingStatus());
  }));
  app.post(`${base}/retry`, staffAuth, superAdmin, wrap(async (req, res) => {
    const { key } = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), confirmNotPublished: z.literal(true) }).parse(req.body);
    const { store } = services();
    await store.retryHeld(key);
    res.json(await facebookSharingStatus());
  }));
}

export function scheduleFacebookArticleChecks() {
  if (!production()) {
    console.log("[FacebookArticles] Development — publishing and automatic checks disabled; manual checks never publish.");
    return;
  }
  const tick = async () => {
    try { await checkFacebookArticles(services(), { allowPublish: true, scheduled: true }); }
    catch (error) { console.error("[FacebookArticles]", error instanceof Error ? error.message : "Daily check failed."); }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);
  console.log("[FacebookArticles] Daily check at 09:00 Europe/London, with delayed catch-up. Publishing requires explicit activation.");
}
