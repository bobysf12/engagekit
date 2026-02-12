import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Account } from "../db/schema";
import type { ScrapeContext, CollectPostOptions, CollectCommentOptions } from "../domain/scrape-types";
import type { PlatformAdapter } from "../platforms/adapter";
import { AuthError, NavigationError } from "../core/errors";
import { logger } from "../core/logger";
import { computeContentHash, computeSnapshotHash } from "../core/hash";
import { extractMediaFingerprint } from "../core/normalize";
import { applyCooldown, actionDelay } from "../core/cooldown";
import { postsRepo } from "../db/repositories/posts.repo";
import { commentsRepo } from "../db/repositories/comments.repo";
import { metricsRepo } from "../db/repositories/metrics.repo";
import { snapshotsRepo } from "../db/repositories/snapshots.repo";
import { env } from "../core/config";

export interface ScrapeResult {
  postsFound: number;
  commentsFound: number;
  snapshotsWritten: number;
  error?: { code: string; message: string };
}

export class AccountScrapeRunner {
  constructor(
    private account: Account,
    private adapter: PlatformAdapter,
    private runAccountId: number
  ) {}

  async run(options: {
    collectNotifications: boolean;
    collectOwnThreads: boolean;
    searchQueries: string[];
  }): Promise<ScrapeResult> {
    logger.info({ accountId: this.account.id, handle: this.account.handle }, "Starting account scrape");

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    const result: ScrapeResult = {
      postsFound: 0,
      commentsFound: 0,
      snapshotsWritten: 0,
    };

    try {
      browser = await chromium.launch({
        headless: env.PLAYWRIGHT_HEADLESS,
        slowMo: env.PLAYWRIGHT_SLOW_MO,
      });

      context = await browser.newContext({
        storageState: this.account.sessionStatePath,
      });

      page = await context.newPage();

      const authState = await this.adapter.validateSession(page);
      if (!authState.isValid) {
        throw new AuthError(authState.error || "Session validation failed", "SESSION_INVALID");
      }

      const postOptions: CollectPostOptions = {
        maxPosts: env.SCRAPER_MAX_POSTS_PER_RUN,
      };

      const collectedPosts: any[] = [];

      if (options.collectNotifications) {
        const notificationPosts = await this.adapter.collectNotifications(page, postOptions);
        collectedPosts.push(...notificationPosts);
        await actionDelay();
      }

      if (options.collectOwnThreads) {
        const ownPosts = await this.adapter.collectOwnThreads(page, postOptions);
        collectedPosts.push(...ownPosts);
        await actionDelay();
      }

      for (const query of options.searchQueries) {
        const searchPosts = await this.adapter.collectSearch(page, query, postOptions);
        collectedPosts.push(...searchPosts);
        await actionDelay();
      }

      const uniquePosts = this.deduplicatePosts(collectedPosts);
      result.postsFound = uniquePosts.length;

      for (const post of uniquePosts) {
        post.contentHash = computeContentHash(post.bodyText || "", post.mediaUrls);

        const postRecord = await postsRepo.create({
          platform: this.account.platform,
          platformPostId: post.platformPostId,
          authorHandle: post.authorHandle,
          authorDisplayName: post.authorDisplayName,
          bodyText: post.bodyText,
          contentHash: post.contentHash,
          postUrl: post.postUrl,
          threadRootPlatformPostId: post.threadRootPlatformPostId,
          publishedAt: post.publishedAt,
          firstSeenAt: Math.floor(Date.now() / 1000),
          lastSeenAt: Math.floor(Date.now() / 1000),
          sourceAccountId: this.account.id,
        });

        if (postRecord) {
          result.snapshotsWritten++;

          const metrics = await this.adapter.extractMetrics(page, "post", post.postUrl || "");
          await metricsRepo.create({
            entityType: "post",
            entityId: postRecord.id,
            ...metrics,
            capturedAt: Math.floor(Date.now() / 1000),
            runAccountId: this.runAccountId,
          });

          await snapshotsRepo.create({
            entityType: "post",
            entityRef: post.platformPostId || `local-${postRecord.id}`,
            platform: this.account.platform,
            snapshotJson: JSON.stringify(post),
            snapshotHash: computeSnapshotHash(post),
            capturedAt: Math.floor(Date.now() / 1000),
            runAccountId: this.runAccountId,
          });
        }
      }

      const commentOptions: CollectCommentOptions = {
        maxComments: env.SCRAPER_MAX_COMMENTS_PER_THREAD,
      };

      for (const post of uniquePosts.slice(0, 10)) {
        try {
          const comments = await this.adapter.expandThreadComments(page, post, commentOptions);
          result.commentsFound += comments.length;

          for (const comment of comments) {
            comment.contentHash = computeContentHash(comment.bodyText || "", comment.mediaUrls);

            const postFromDbList = await postsRepo.findByContentHash(post.contentHash);
            const postFromDb = postFromDbList[0];
            if (!postFromDb) continue;

            const commentRecord = await commentsRepo.create({
              platform: this.account.platform,
              platformCommentId: comment.platformCommentId,
              parentPostId: postFromDb.id,
              authorHandle: comment.authorHandle,
              authorDisplayName: comment.authorDisplayName,
              bodyText: comment.bodyText,
              contentHash: comment.contentHash,
              commentUrl: comment.commentUrl,
              publishedAt: comment.publishedAt,
              firstSeenAt: Math.floor(Date.now() / 1000),
              lastSeenAt: Math.floor(Date.now() / 1000),
              sourceAccountId: this.account.id,
            });

            if (commentRecord) {
              result.snapshotsWritten++;

              await snapshotsRepo.create({
                entityType: "comment",
                entityRef: comment.platformCommentId || `local-${commentRecord.id}`,
                platform: this.account.platform,
                snapshotJson: JSON.stringify(comment),
                snapshotHash: computeSnapshotHash(comment),
                capturedAt: Math.floor(Date.now() / 1000),
                runAccountId: this.runAccountId,
              });
            }
          }
        } catch (error) {
          logger.debug({ error, postUrl: post.postUrl }, "Failed to expand thread comments");
        }
      }

      logger.info(
        {
          accountId: this.account.id,
          postsFound: result.postsFound,
          commentsFound: result.commentsFound,
          snapshotsWritten: result.snapshotsWritten,
        },
        "Account scrape completed successfully"
      );

      return result;
    } catch (error: any) {
      logger.error({ accountId: this.account.id, error }, "Account scrape failed");
      result.error = {
        code: error.code || "UNKNOWN_ERROR",
        message: error.message || "Unknown error occurred",
      };
      return result;
    } finally {
      if (page) await page.close();
      if (context) await context.close();
      if (browser) await browser.close();

      await applyCooldown(this.account.cooldownSeconds);
    }
  }

  private deduplicatePosts(posts: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const post of posts) {
      const key = post.platformPostId || `${post.authorHandle}:${post.contentHash}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(post);
      }
    }

    return unique;
  }
}
