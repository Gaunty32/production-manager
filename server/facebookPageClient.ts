import type { FacebookArticlePreview } from "@shared/facebookArticleSharing";
import type { ExistingFacebookPost } from "./facebookArticleRules";

export class FacebookRequestError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}

export class FacebookPageClient {
  constructor(private pageId: string, private token: string, private request: typeof fetch = fetch) {
    if (!/^\d+$/.test(pageId) || !token) throw new Error("Facebook Page ID and Page access token must be configured.");
  }

  private async call(path: string, params: Record<string, string>, method = "GET") {
    const url = new URL(`https://graph.facebook.com/v27.0/${path}`);
    if (method === "GET") for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.request(url.toString(), {
        method, headers: { Authorization: `Bearer ${this.token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(method === "POST" ? { body: JSON.stringify(params) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new FacebookRequestError("Facebook could not confirm the request. Check the Page before retrying a publication.", method === "POST");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error) {
      const code = Number(body?.error?.code);
      const explanation = code === 190 ? "The Facebook token is invalid or needs renewing."
        : code === 200 || code === 10 ? "Facebook denied the required Page permissions."
        : `Facebook request failed (HTTP ${response.status}${Number.isFinite(code) ? `, code ${code}` : ""}).`;
      throw new FacebookRequestError(explanation, method === "POST" && (response.status >= 500 || response.ok || !body));
    }
    return body;
  }

  async verify() {
    const page = await this.call("me", { fields: "id,name,category" });
    if (page.id !== this.pageId || !page.category || !page.name) throw new Error("The Facebook token is not a Page token for the configured company Page.");
    return { id: String(page.id), name: String(page.name) };
  }

  async postsSince(since: string): Promise<ExistingFacebookPost[]> {
    const posts: ExistingFacebookPost[] = [];
    const cursors = new Set<string>();
    let after = "";
    for (let page = 0; page < 20; page++) {
      const body = await this.call(`${this.pageId}/published_posts`, {
        fields: "id,message,created_time,attachments{url,target,subattachments{url,target}}",
        since: String(Math.floor(Date.parse(since) / 1000)), limit: "100", ...(after ? { after } : {}),
      });
      if (!Array.isArray(body.data)) throw new Error("Facebook did not return a complete list of published posts.");
      for (const post of body.data) {
        const urls: string[] = [];
        const collect = (attachments: any[]) => {
          for (const item of attachments || []) {
            if (typeof item.url === "string") urls.push(item.url);
            if (typeof item.target?.url === "string") urls.push(item.target.url);
            collect(item.subattachments?.data || []);
          }
        };
        collect(post.attachments?.data || []);
        if (typeof post.id !== "string") throw new Error("Facebook returned an invalid published post.");
        posts.push({ id: post.id, message: typeof post.message === "string" ? post.message : "", urls });
      }
      if (!body.paging?.next) return posts;
      const next = body.paging?.cursors?.after;
      if (typeof next !== "string" || cursors.has(next)) throw new Error("Facebook's post list could not be fully checked; publishing was stopped.");
      cursors.add(next);
      after = next;
    }
    throw new Error("Facebook returned too many posts to verify safely; publishing was stopped.");
  }

  async publish(preview: FacebookArticlePreview) {
    const result = await this.call(`${this.pageId}/photos`, {
      url: preview.imageUrl, message: preview.message, published: "true",
    }, "POST");
    if (typeof result.post_id !== "string" || !result.post_id.startsWith(`${this.pageId}_`)) {
      throw new FacebookRequestError("Facebook did not return a confirmed Page post ID. Check the Page before retrying.", true);
    }
    return result.post_id;
  }
}
