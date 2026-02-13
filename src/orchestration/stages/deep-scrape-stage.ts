import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Account } from "../../db/schema";
import type { PlatformAdapter } from "../../platforms/adapter";
import type { CollectCommentOptions } from "../../domain/scrape-types";
import { logger } from "../../core/logger";
import { env } from "../../core/config";
import { deepScrapeTasksRepo } from "../../db/repositories/deep-scrape-tasks.repo";
import { postsRepo } from "../../db/repositories/posts.repo";
import { commentsRepo } from "../../db/repositories/comments.repo";
import { metricsRepo } from "../../db/repositories/metrics.repo";
import { snapshotsRepo } from "../../db/repositories/snapshots.repo";
import { computeContentHash, computeSnapshotHash } from "../../core/hash";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { ThreadsAdapter } from "../../platforms/threads";
import { XAdapter } from "../../platforms/x";

export interface DeepScrapeStageInput {
  runAccountId: number;
  accountId: number;
}

export interface DeepScrapeStageResult {
  totalTasks: number;
  successCount: number;
  failedCount: number;
  commentsCollected: number;
  errors: Array<{ postId: number; error: string }>;
}

export class DeepScrapeStage {
  async run(input: DeepScrapeStageInput): Promise<DeepScrapeStageResult> {
    if (!env.DEEP_SCRAPE_ENABLED) {
      logger.info({ runAccountId: input.runAccountId }, "Deep scrape stage disabled, skipping");
      return { totalTasks: 0, successCount: 0, failedCount: 0, commentsCollected: 0, errors: [] };
    }

    logger.info({ runAccountId: input.runAccountId }, "Starting deep scrape stage");

    const tasks = await deepScrapeTasksRepo.listByStatus(input.runAccountId, "pending");

    const result: DeepScrapeStageResult = {
      totalTasks: tasks.length,
      successCount: 0,
      failedCount: 0,
      commentsCollected: 0,
      errors: [],
    };

    if (tasks.length === 0) {
      logger.info({ runAccountId: input.runAccountId }, "No pending deep scrape tasks");
      return result;
    }

    const account = await accountsRepo.findById(input.accountId);
    if (!account) {
      throw new Error(`Account ${input.accountId} not found`);
    }

    const adapter = this.getAdapter(account.platform);
    const postRecords = await this.loadPosts(tasks.map((t) => t.postId));

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: env.PLAYWRIGHT_HEADLESS,
        slowMo: env.PLAYWRIGHT_SLOW_MO,
      });

      context = await browser.newContext({
        storageState: account.sessionStatePath,
      });

      page = await context.newPage();
      page.setDefaultNavigationTimeout(12000);
      page.setDefaultTimeout(12000);

      const authState = await adapter.validateSession(page);
      if (!authState.isValid) {
        throw new Error(`Session invalid: ${authState.error}`);
      }

      const commentOptions: CollectCommentOptions = {
        maxComments: env.SCRAPER_MAX_COMMENTS_PER_THREAD,
      };

      for (const task of tasks) {
        const post = postRecords.get(task.postId);
        if (!post) {
          logger.warn({ taskId: task.id, postId: task.postId }, "Post not found for task");
          continue;
        }

        await deepScrapeTasksRepo.markRunning(task.id);

        try {
          const collectedComments = await adapter.expandThreadComments(page, {
            platformPostId: post.platformPostId,
            postUrl: post.postUrl,
            authorHandle: post.authorHandle,
            authorDisplayName: post.authorDisplayName,
            bodyText: post.bodyText,
            contentHash: post.contentHash,
            threadRootPlatformPostId: post.threadRootPlatformPostId,
            publishedAt: post.publishedAt,
            mediaUrls: [],
          }, commentOptions);

          await this.persistComments(post.id, collectedComments, input.runAccountId, account.id);

          await deepScrapeTasksRepo.markSuccess(task.id);
          result.successCount++;
          result.commentsCollected += collectedComments.length;

          logger.debug(
            { taskId: task.id, postId: post.id, commentCount: collectedComments.length },
            "Deep scrape task completed"
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          await deepScrapeTasksRepo.markFailed(task.id, "DEEP_SCRAPE_ERROR", errorMessage);
          result.failedCount++;
          result.errors.push({ postId: task.postId, error: errorMessage });

          logger.error(
            { taskId: task.id, postId: task.postId, error: errorMessage },
            "Deep scrape task failed"
          );
        }
      }
    } finally {
      if (page) await page.close();
      if (context) await context.close();
      if (browser) await browser.close();
    }

    logger.info(
      { runAccountId: input.runAccountId, ...result },
      "Deep scrape stage completed"
    );

    return result;
  }

  private getAdapter(platform: string): PlatformAdapter {
    switch (platform) {
      case "threads":
        return new ThreadsAdapter();
      case "x":
        return new XAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async loadPosts(postIds: number[]): Promise<Map<number, import("../../db/schema").Post>> {
    const posts = new Map<number, import("../../db/schema").Post>();
    for (const postId of postIds) {
      const post = await postsRepo.findById(postId);
      if (post) {
        posts.set(postId, post);
      }
    }
    return posts;
  }

  private async persistComments(
    parentPostId: number,
    comments: Array<{
      platformCommentId: string | null;
      authorHandle: string;
      authorDisplayName: string;
      bodyText: string | null;
      commentUrl: string | null;
      publishedAt: number | null;
      mediaUrls: string[];
    }>,
    runAccountId: number,
    sourceAccountId: number
  ): Promise<void> {
    for (const comment of comments) {
      const contentHash = computeContentHash(comment.bodyText || "", comment.mediaUrls);

      const commentRecord = await commentsRepo.create({
        platform: (await postsRepo.findById(parentPostId))?.platform || "threads",
        platformCommentId: comment.platformCommentId,
        parentPostId,
        authorHandle: comment.authorHandle,
        authorDisplayName: comment.authorDisplayName,
        bodyText: comment.bodyText,
        contentHash,
        commentUrl: comment.commentUrl,
        publishedAt: comment.publishedAt,
        firstSeenAt: Math.floor(Date.now() / 1000),
        lastSeenAt: Math.floor(Date.now() / 1000),
        sourceAccountId,
      });

      if (commentRecord) {
        await metricsRepo.create({
          entityType: "comment",
          entityId: commentRecord.id,
          likesCount: null,
          repliesCount: null,
          repostsCount: null,
          viewsCount: null,
          capturedAt: Math.floor(Date.now() / 1000),
          runAccountId,
        });

        await snapshotsRepo.create({
          entityType: "comment",
          entityRef: comment.platformCommentId || `local-${commentRecord.id}`,
          platform: (await postsRepo.findById(parentPostId))?.platform || "threads",
          snapshotJson: JSON.stringify(comment),
          snapshotHash: computeSnapshotHash(comment),
          capturedAt: Math.floor(Date.now() / 1000),
          runAccountId,
        });
      }
    }
  }
}

export const deepScrapeStage = new DeepScrapeStage();
