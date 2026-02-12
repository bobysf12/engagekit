import type { Page, BrowserContext } from "playwright";
import type { AuthState } from "../domain/models";
import type { CollectedPost, CollectedComment, MetricSnapshot } from "../domain/models";

export interface CollectPostOptions {
  maxPosts?: number;
}

export interface CollectCommentOptions {
  maxComments?: number;
}

export interface PlatformAdapter {
  readonly platform: string;

  validateSession(page: Page): Promise<AuthState>;

  collectHome(page: Page, options: CollectPostOptions): Promise<CollectedPost[]>;

  collectProfileByHandle(page: Page, handle: string, options: CollectPostOptions): Promise<CollectedPost[]>;

  collectSearch(page: Page, query: string, options: CollectPostOptions): Promise<CollectedPost[]>;

  expandThreadComments(page: Page, post: CollectedPost, options: CollectCommentOptions): Promise<CollectedComment[]>;

  extractMetrics(page: Page, entityType: "post" | "comment", entityRef: string): Promise<MetricSnapshot>;

  performLogin(page: Page, handle: string): Promise<void>;
}
