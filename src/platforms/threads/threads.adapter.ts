import type { Page } from "playwright";
import type { AuthState, CollectedPost, CollectedComment, MetricSnapshot } from "../../domain/models";
import type { PlatformAdapter, CollectPostOptions, CollectCommentOptions } from "../adapter";
import { AuthError, NavigationError, ParseError } from "../../core/errors";
import { THREADS_SELECTORS } from "./selectors";
import { performThreadsLogin, validateThreadsSession } from "./auth";
import { parsePostFromElement, parseCommentFromElement, extractMetricsFromElement } from "./parsers";
import { actionDelay } from "../../core/cooldown";
import { logger } from "../../core/logger";

export class ThreadsAdapter implements PlatformAdapter {
  readonly platform = "threads";

  async validateSession(page: Page): Promise<AuthState> {
    logger.debug("Validating Threads session");
    return validateThreadsSession(page);
  }

  performLogin(page: Page, handle: string): Promise<void> {
    logger.info({ handle }, "Performing Threads login");
    return performThreadsLogin(page, handle);
  }

  async collectNotifications(page: Page, options: CollectPostOptions): Promise<CollectedPost[]> {
    logger.debug("Collecting Threads notifications");
    await page.goto(`${THREADS_SELECTORS.HOME_URL}/notifications`);
    await page.waitForLoadState("networkidle");
    await actionDelay();

    const posts: CollectedPost[] = [];
    const maxPosts = options.maxPosts ?? 50;

    try {
      const postElements = await page.locator(THREADS_SELECTORS.NOTIFICATIONS.NOTIFICATION_ITEM).all();
      const limit = Math.min(postElements.length, maxPosts);

      for (let i = 0; i < limit; i++) {
        try {
          const el = postElements[i];
          if (!el) continue;
          const handle = await el.elementHandle();
          if (!handle) continue;
          const post = await parsePostFromElement(handle, page);
          if (post) posts.push(post);
        } catch (error) {
          logger.debug({ error, index: i }, "Failed to parse notification post");
        }
      }
    } catch (error) {
      throw new NavigationError("Failed to collect notifications", "COLLECT_NOTIFICATIONS_FAILED");
    }

    return posts;
  }

  async collectOwnThreads(page: Page, options: CollectPostOptions): Promise<CollectedPost[]> {
    logger.debug("Collecting Threads own posts");
    await page.goto(`${THREADS_SELECTORS.HOME_URL}/@${options.maxPosts ? "" : "profile"}`);
    await page.waitForLoadState("networkidle");
    await actionDelay();

    const posts: CollectedPost[] = [];
    const maxPosts = options.maxPosts ?? 50;

    try {
      const postElements = await page.locator(THREADS_SELECTORS.POSTS.POST_ITEM).all();
      const limit = Math.min(postElements.length, maxPosts);

      for (let i = 0; i < limit; i++) {
        try {
          const el = postElements[i];
          if (!el) continue;
          const handle = await el.elementHandle();
          if (!handle) continue;
          const post = await parsePostFromElement(handle, page);
          if (post) posts.push(post);
        } catch (error) {
          logger.debug({ error, index: i }, "Failed to parse own post");
        }
      }
    } catch (error) {
      throw new NavigationError("Failed to collect own threads", "COLLECT_OWN_THREADS_FAILED");
    }

    return posts;
  }

  async collectSearch(page: Page, query: string, options: CollectPostOptions): Promise<CollectedPost[]> {
    logger.debug({ query }, "Collecting Threads search results");
    await page.goto(THREADS_SELECTORS.HOME_URL);
    await actionDelay();

    const searchInput = page.locator(THREADS_SELECTORS.NAVIGATION.SEARCH).first();
    await searchInput.click();
    await searchInput.fill(query);
    await actionDelay();

    try {
      await page.keyboard.press("Enter");
      await page.waitForLoadState("networkidle");
      await actionDelay();
    } catch {
      logger.debug("Search submit failed, continuing anyway");
    }

    const posts: CollectedPost[] = [];
    const maxPosts = options.maxPosts ?? 50;

    try {
      const postElements = await page.locator(THREADS_SELECTORS.POSTS.POST_ITEM).all();
      const limit = Math.min(postElements.length, maxPosts);

      for (let i = 0; i < limit; i++) {
        try {
          const el = postElements[i];
          if (!el) continue;
          const handle = await el.elementHandle();
          if (!handle) continue;
          const post = await parsePostFromElement(handle, page);
          if (post) posts.push(post);
        } catch (error) {
          logger.debug({ error, index: i }, "Failed to parse search result");
        }
      }
    } catch (error) {
      throw new NavigationError("Failed to collect search results", "COLLECT_SEARCH_FAILED");
    }

    return posts;
  }

  async expandThreadComments(
    page: Page,
    post: CollectedPost,
    options: CollectCommentOptions
  ): Promise<CollectedComment[]> {
    logger.debug({ postId: post.platformPostId }, "Expanding thread comments");
    const comments: CollectedComment[] = [];
    const maxComments = options.maxComments ?? 50;

    if (!post.postUrl) {
      return comments;
    }

    try {
      await page.goto(post.postUrl);
      await page.waitForLoadState("networkidle");
      await actionDelay();

      try {
        const loadMoreButton = page.locator(THREADS_SELECTORS.COMMENTS.LOAD_MORE_COMMENTS).first();
        let attempts = 0;
        while ((await loadMoreButton.isVisible({ timeout: 2000 })) && attempts < 3) {
          await loadMoreButton.click();
          await page.waitForTimeout(1000);
          attempts++;
        }
      } catch {
        logger.debug("No load more button or click failed");
      }

      const commentElements = await page.locator(THREADS_SELECTORS.COMMENTS.COMMENT_CONTAINER).all();
      const limit = Math.min(commentElements.length, maxComments);

      for (let i = 0; i < limit; i++) {
        try {
          const el = commentElements[i];
          if (!el) continue;
          const handle = await el.elementHandle();
          if (!handle) continue;
          const comment = await parseCommentFromElement(handle, 0);
          if (comment) comments.push(comment);
        } catch (error) {
          logger.debug({ error, index: i }, "Failed to parse comment");
        }
      }
    } catch (error) {
      logger.debug({ error }, "Failed to expand thread comments");
    }

    return comments;
  }

  async extractMetrics(page: Page, entityType: "post" | "comment", entityRef: string): Promise<MetricSnapshot> {
    logger.debug({ entityType, entityRef }, "Extracting metrics");

    if (!entityRef.startsWith("http")) {
      entityRef = `${THREADS_SELECTORS.HOME_URL}${entityRef}`;
    }

    await page.goto(entityRef);
    await page.waitForLoadState("networkidle");
    await actionDelay();

    try {
      const postElement = await page.locator(THREADS_SELECTORS.POSTS.POST_ITEM).first();
      const elementHandle = await postElement.elementHandle();
      if (!elementHandle) {
        return { likesCount: null, repliesCount: null, repostsCount: null, viewsCount: null };
      }
      return await extractMetricsFromElement(elementHandle);
    } catch (error) {
      logger.debug({ error }, "Failed to extract metrics");
      return { likesCount: null, repliesCount: null, repostsCount: null, viewsCount: null };
    }
  }
}
