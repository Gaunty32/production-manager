export type FacebookArticleStatus = "published" | "already_shared" | "blocked" | "publishing" | "review" | "rejected";

export interface FacebookArticleRecord {
  key: string;
  title: string;
  articleUrl: string;
  status: FacebookArticleStatus;
  updatedAt: string;
  facebookPostId?: string;
  error?: string;
}

export interface FacebookArticlePreview {
  title: string;
  articleUrl: string;
  imageUrl: string;
  /** Opening prose, with a blank line between the first two paragraphs. */
  paragraph: string;
  message: string;
}

export interface FacebookSharingStatus {
  enabled: boolean;
  soroSharingStopped: boolean;
  development: boolean;
  schedule: string;
  timeZone: string;
  configured: boolean;
  pageId: string | null;
  pageName: string | null;
  initializedAt: string | null;
  activatedAt: string | null;
  baselineCount: number;
  lastCheckedAt: string | null;
  lastError: string | null;
  preview: FacebookArticlePreview | null;
  recent: FacebookArticleRecord[];
}
