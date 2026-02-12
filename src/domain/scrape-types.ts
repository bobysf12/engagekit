import type { Platform } from "./models";

export interface ScrapeConfig {
  platform: Platform;
  maxPostsPerRun?: number;
  maxCommentsPerThread?: number;
  actionDelayMs?: { min: number; max: number };
}

export interface ScrapeCollectorOptions {
  collectNotifications: boolean;
  collectOwnThreads: boolean;
  searchQueries: string[];
}

export interface ScrapeResult {
  accountId: number;
  postsFound: number;
  commentsFound: number;
  snapshotsWritten: number;
  error?: { code: string; message: string };
}

export interface CollectPostOptions {
  maxPosts?: number;
}

export interface CollectCommentOptions {
  maxComments?: number;
}

export interface ScrapeContext {
  accountId: number;
  runAccountId: number;
  platform: Platform;
}
