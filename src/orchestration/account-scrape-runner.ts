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
import { getRequiredStorageState, hasSessionState } from "../services/playwright-session-state";
import {
  launchPersistentContext,
  closeContextSafely,
  detectBlockChallenge,
} from "../services/browser-session";

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
    collectHome: boolean;
    collectProfiles: boolean;
    profileHandles: string[];
    searchQueries: string[];
    maxPostsPerRun?: number;
  }): Promise<ScrapeResult> {
    logger.info({ accountId: this.account.id, handle: this.account.handle }, "Starting account scrape");

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let usePersistentContext = false;

    const result: ScrapeResult = {
      postsFound: 0,
      commentsFound: 0,
      snapshotsWritten: 0,
    };

    try {
      const useThreadsPersistent = this.account.platform === "threads";
      const storageStateForFallback = hasSessionState(this.account)
        ? getRequiredStorageState(this.account)
        : null;

      if (useThreadsPersistent) {
        try {
          const persistentResult = await launchPersistentContext(
            this.account.id,
            this.account.platform,
            {
              headless: env.PLAYWRIGHT_HEADLESS,
              slowMo: env.PLAYWRIGHT_SLOW_MO,
              storageState: storageStateForFallback ?? undefined,
            }
          );
          context = persistentResult.context;
          usePersistentContext = true;
          logger.info(
            { accountId: this.account.id, profileDir: persistentResult.profileDir, isNew: persistentResult.isNew },
            "Using persistent browser context for Threads"
          );

          const existingPages = context.pages();
          if (existingPages.length > 0) {
            page = existingPages[0]!;
          } else {
            page = await context.newPage();
          }
        } catch (persistentError) {
          logger.warn(
            { accountId: this.account.id, error: persistentError },
            "Failed to launch persistent context, falling back to storageState"
          );
          usePersistentContext = false;
        }
      }

      if (!usePersistentContext) {
        if (!storageStateForFallback) {
          throw new AuthError("Session state not found in database", "SESSION_STATE_MISSING");
        }

        browser = await chromium.launch({
          headless: env.PLAYWRIGHT_HEADLESS,
          slowMo: env.PLAYWRIGHT_SLOW_MO,
        });

        context = await browser.newContext({
          storageState: storageStateForFallback as any,
        });

        page = await context.newPage();
      }

      if (!page) {
        throw new NavigationError("Failed to create page", "PAGE_CREATION_FAILED");
      }

      page.setDefaultNavigationTimeout(12000);
      page.setDefaultTimeout(12000);

      const currentUrl = page.url();
      const blockStatus = detectBlockChallenge(currentUrl);
      if (blockStatus.isBlocked) {
        logger.error(
          { accountId: this.account.id, url: currentUrl, reason: blockStatus.reason, stage: "page_setup" },
          "Block/challenge detected on page URL"
        );
        throw new AuthError(
          `Block/challenge detected: ${blockStatus.reason}`,
          "BLOCK_CHALLENGE_DETECTED"
        );
      }

      let authState = await this.adapter.validateSession(page);
      if (!authState.isValid && usePersistentContext && storageStateForFallback) {
        logger.warn(
          { accountId: this.account.id, authError: authState.error },
          "Persistent context validation failed; retrying with storageState fallback"
        );

        await closeContextSafely(context);
        usePersistentContext = false;
        context = null;
        page = null;

        browser = await chromium.launch({
          headless: env.PLAYWRIGHT_HEADLESS,
          slowMo: env.PLAYWRIGHT_SLOW_MO,
        });

        context = await browser.newContext({
          storageState: storageStateForFallback as any,
        });

        page = await context.newPage();
        page.setDefaultNavigationTimeout(12000);
        page.setDefaultTimeout(12000);

        authState = await this.adapter.validateSession(page);
      }

      if (!authState.isValid) {
        throw new AuthError(authState.error || "Session validation failed", "SESSION_INVALID");
      }

      const postOptions: CollectPostOptions = {
        maxPosts: options.maxPostsPerRun ?? env.SCRAPER_MAX_POSTS_PER_RUN,
      };

      const collectedPosts: any[] = [];

      if (options.collectHome) {
        const homePosts = await this.adapter.collectHome(page, postOptions);
        collectedPosts.push(...homePosts);
        await actionDelay();
      }

      if (options.collectProfiles) {
        const handles = [this.account.handle, ...options.profileHandles]
          .map((handle) => handle.replace(/^@/, "").trim())
          .filter((handle, index, arr) => handle.length > 0 && arr.indexOf(handle) === index);

        for (const handle of handles) {
          const profilePosts = await this.adapter.collectProfileByHandle(page, handle, postOptions);
          collectedPosts.push(...profilePosts);
          await actionDelay();
        }
      }

      for (const query of options.searchQueries) {
        const searchPosts = await this.adapter.collectSearch(page, query, postOptions);
        collectedPosts.push(...searchPosts);
        await actionDelay();
      }

      const uniquePosts = this.deduplicatePosts(collectedPosts);
      result.postsFound = uniquePosts.length;
      let metricsTimeoutStreak = 0;
      const postIdByPlatformPostId = new Map<string, number>();

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
          if (post.platformPostId) {
            postIdByPlatformPostId.set(post.platformPostId, postRecord.id);
          }

          result.snapshotsWritten++;

          // Extract metrics with bounded navigation timeouts in adapter
          type MetricSnapshot = { likesCount: number | null; repliesCount: number | null; repostsCount: number | null; viewsCount: number | null };
          let metrics: MetricSnapshot = { likesCount: null, repliesCount: null, repostsCount: null, viewsCount: null };
          if (metricsTimeoutStreak < 3) {
            try {
              metrics = await this.adapter.extractMetrics(page, "post", post.postUrl || "");
              metricsTimeoutStreak = 0;
            } catch (error: any) {
              if (error?.name === "TimeoutError") {
                metricsTimeoutStreak++;
              }
              logger.debug({ error, postUrl: post.postUrl, metricsTimeoutStreak }, "Metrics extraction failed");
            }
          } else {
            logger.debug({ postUrl: post.postUrl }, "Skipping metrics after repeated timeouts");
          }
          
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
      let commentMetricsTimeoutStreak = 0;

      for (const post of uniquePosts.slice(0, 10)) {
        try {
          const comments = await this.adapter.expandThreadComments(page, post, commentOptions).catch((error) => {
            logger.debug({ error, postUrl: post.postUrl }, "Comment extraction failed");
            return [];
          });

          logger.debug(
            { postUrl: post.postUrl, postId: post.platformPostId, extractedComments: comments.length },
            "Comment extraction result",
          );

          result.commentsFound += comments.length;

          if (comments.length === 0) {
            continue;
          }

          let parentPostId: number | null = null;
          if (post.platformPostId) {
            parentPostId = postIdByPlatformPostId.get(post.platformPostId) ?? null;
          }

          if (!parentPostId && post.platformPostId) {
            const persisted = await postsRepo.findByPlatformPostId(this.account.platform, post.platformPostId);
            parentPostId = persisted?.id ?? null;
            if (persisted?.id) {
              postIdByPlatformPostId.set(post.platformPostId, persisted.id);
            }
          }

          if (!parentPostId) {
            logger.debug(
              { postUrl: post.postUrl, postId: post.platformPostId },
              "Skipping comment persistence because parent post ID could not be resolved",
            );
            continue;
          }

          for (const comment of comments) {
            comment.contentHash = computeContentHash(comment.bodyText || "", comment.mediaUrls);

            const commentRecord = await commentsRepo.create({
              platform: this.account.platform,
              platformCommentId: comment.platformCommentId,
              parentPostId,
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

              type CommentMetricSnapshot = { likesCount: number | null; repliesCount: number | null; repostsCount: number | null; viewsCount: number | null };
              let commentMetrics: CommentMetricSnapshot = { likesCount: null, repliesCount: null, repostsCount: null, viewsCount: null };
              if (comment.commentUrl && commentMetricsTimeoutStreak < 3) {
                try {
                  commentMetrics = await this.adapter.extractMetrics(page, "comment", comment.commentUrl);
                  commentMetricsTimeoutStreak = 0;
                } catch (error: any) {
                  if (error?.name === "TimeoutError") {
                    commentMetricsTimeoutStreak++;
                  }
                  logger.debug({ error, commentUrl: comment.commentUrl, commentMetricsTimeoutStreak }, "Comment metrics extraction failed");
                }
              }

              await metricsRepo.create({
                entityType: "comment",
                entityId: commentRecord.id,
                ...commentMetrics,
                capturedAt: Math.floor(Date.now() / 1000),
                runAccountId: this.runAccountId,
              });

              await snapshotsRepo.create({
                entityType: "comment",
                entityRef: comment.platformCommentId || `local-${commentRecord.id}`,
                platform: this.account.platform,
                snapshotJson: JSON.stringify(comment),
                snapshotHash: computeSnapshotHash(comment),
                capturedAt: Math.floor(Date.now() / 1000),
                runAccountId: this.runAccountId,
              });
            } else {
              logger.debug(
                {
                  postUrl: post.postUrl,
                  postId: post.platformPostId,
                  commentAuthor: comment.authorHandle,
                  publishedAt: comment.publishedAt,
                },
                "Comment was not inserted (likely deduplicated)",
              );
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
      if (usePersistentContext) {
        if (page) {
          try {
            await page.close().catch(() => {});
          } catch {}
        }
        await closeContextSafely(context);
      } else {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      }

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
