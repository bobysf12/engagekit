/// <reference lib="dom" />
import type { Page } from "playwright";
import type { AuthState, CollectedPost, CollectedComment, MetricSnapshot } from "../../domain/models";
import type { PlatformAdapter, CollectPostOptions, CollectCommentOptions } from "../adapter";
import { NavigationError } from "../../core/errors";
import { THREADS_SELECTORS } from "./selectors";
import { performThreadsLogin, validateThreadsSession } from "./auth";
import { actionDelay } from "../../core/cooldown";
import { logger } from "../../core/logger";
import { detectBlockChallenge } from "../../services/browser-session";

// Type for the post extraction result from page.evaluate
interface ExtractedPost {
  platformPostId: string;
  authorHandle: string;
  bodyText: string | null;
  postUrl: string;
}

export class ThreadsAdapter implements PlatformAdapter {
  readonly platform = "threads";

  private parseCompactNumber(value: string | null | undefined): number | null {
    if (!value) return null;

    const normalized = value.replace(/\s+/g, "").replace(/,/g, "").trim();
    if (!normalized) return null;

    const match = normalized.match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
    if (!match) return null;

    const base = Number.parseFloat(match[1] || "");
    if (!Number.isFinite(base)) return null;

    const suffix = (match[2] || "").toUpperCase();
    if (suffix === "K") return Math.round(base * 1_000);
    if (suffix === "M") return Math.round(base * 1_000_000);
    if (suffix === "B") return Math.round(base * 1_000_000_000);
    return Math.round(base);
  }

  private parseMetricByLabel(text: string, label: "like" | "reply" | "repost" | "view"): number | null {
    if (!text) return null;

    const compactPattern = "(\\d+(?:[.,]\\d+)?(?:\\s?[KMB])?)";
    const patterns = [
      new RegExp(`\\b${label}s?\\s*:?\\s*${compactPattern}`, "i"),
      new RegExp(`${compactPattern}\\s*\\b${label}s?\\b`, "i"),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const parsed = this.parseCompactNumber(match?.[1]);
      if (parsed !== null) return parsed;
    }

    return null;
  }

  private async safeGoto(page: Page, url: string, source: string): Promise<void> {
    const currentUrl = page.url();
    const isSameOrigin = currentUrl.startsWith(THREADS_SELECTORS.HOME_URL) && url.startsWith(THREADS_SELECTORS.HOME_URL);
    const isAlreadyOnTarget = currentUrl === url || (isSameOrigin && this.isSamePage(currentUrl, url));
    
    if (isAlreadyOnTarget) {
      logger.debug({ currentUrl, targetUrl: url, source }, "Already on target page, skipping hard navigation");
      await page.waitForTimeout(800);
      return;
    }
    
    if (isSameOrigin) {
      logger.debug({ currentUrl, targetUrl: url, source }, "Same-origin navigation, using soft transition");
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 8000,
        });
      } catch (error) {
        logger.debug({ error, url, source }, "Soft navigation timeout, continuing with current DOM");
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
    } else {
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 12000,
        });
      } catch (error) {
        logger.debug({ error, url, source }, "Threads navigation timeout, continuing with current DOM");
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
    }

    const finalUrl = page.url();
    const blockStatus = detectBlockChallenge(finalUrl);
    if (blockStatus.isBlocked) {
      logger.error(
        { url: finalUrl, targetUrl: url, source, reason: blockStatus.reason, stage: "navigation" },
        "Threads block/challenge detected during navigation"
      );
    } else {
      logger.debug(
        { url: finalUrl, targetUrl: url, source, stage: "navigation" },
        "Threads navigation completed"
      );
    }
  }

  private isSamePage(url1: string, url2: string): boolean {
    try {
      const u1 = new URL(url1);
      const u2 = new URL(url2);
      return u1.pathname === u2.pathname && u1.search === u2.search;
    } catch {
      return false;
    }
  }

  private logBlockTelemetry(page: Page, source: string, extra?: Record<string, unknown>): void {
    const url = page.url();
    const blockStatus = detectBlockChallenge(url);
    if (blockStatus.isBlocked) {
      logger.error(
        { url, source, reason: blockStatus.reason, ...extra },
        "Threads block/challenge telemetry"
      );
    }
  }

  async validateSession(page: Page): Promise<AuthState> {
    logger.debug("Validating Threads session");
    const result = await validateThreadsSession(page);
    
    if (!result.isValid) {
      const url = page.url();
      const blockStatus = detectBlockChallenge(url);
      if (blockStatus.isBlocked) {
        logger.error(
          { url, reason: blockStatus.reason, authError: result.error, stage: "auth_validation" },
          "Threads block/challenge detected during session validation"
        );
      } else {
        logger.warn(
          { url, authError: result.error, stage: "auth_validation" },
          "Threads session validation failed"
        );
      }
    }
    
    return result;
  }

  performLogin(page: Page, handle: string): Promise<void> {
    logger.info({ handle }, "Performing Threads login");
    return performThreadsLogin(page, handle);
  }

  async collectHome(page: Page, options: CollectPostOptions): Promise<CollectedPost[]> {
    logger.debug("Collecting Threads home feed");

    await this.safeGoto(page, THREADS_SELECTORS.HOME_URL, "home");
    await actionDelay();

    return this.collectPostsFromCurrentPage(page, options.maxPosts ?? 50, "home");
  }

  async collectProfileByHandle(page: Page, handle: string, options: CollectPostOptions): Promise<CollectedPost[]> {
    const normalizedHandle = handle.replace(/^@/, "").trim();
    logger.debug({ handle: normalizedHandle }, "Collecting Threads profile feed");

    await this.safeGoto(page, `${THREADS_SELECTORS.HOME_URL}/@${normalizedHandle}`, `profile:${normalizedHandle}`);
    await actionDelay();

    return this.collectPostsFromCurrentPage(page, options.maxPosts ?? 50, `profile:${normalizedHandle}`);
  }

  async collectSearch(page: Page, query: string, options: CollectPostOptions): Promise<CollectedPost[]> {
    logger.debug({ query }, "Collecting Threads search results");
    const searchUrl = query.startsWith("http")
      ? query
      : `${THREADS_SELECTORS.HOME_URL}/search?q=${encodeURIComponent(query)}&serp_type=default&filter=recent`;

    await this.safeGoto(page, searchUrl, `search:${query}`);
    await actionDelay();

    return this.collectPostsFromCurrentPage(page, options.maxPosts ?? 50, `search:${query}`);
  }

  private async collectPostsFromCurrentPage(page: Page, maxPosts: number, source: string): Promise<CollectedPost[]> {
    const postById = new Map<string, CollectedPost>();
    let previousUniqueCount = 0;
    let navigationTimeoutCount = 0;

    try {
      for (let pass = 0; pass < 8 && postById.size < maxPosts; pass++) {
        this.logBlockTelemetry(page, source, { pass, postsCollected: postById.size });
        // Extract posts by locating the nearest post container and filtering text nodes.
        const posts = await page.evaluate((homeUrl): ExtractedPost[] => {
          // eslint-disable-next-line no-var
          var results: ExtractedPost[] = [];

          const cleanText = (value: string | null | undefined): string =>
            (value || "").replace(/\s+/g, " ").trim();

          const postLinkSelector = 'a[href*="/post/"]:not([href*="/media"])';

          const pickPostContainer = (link: HTMLElement): HTMLElement | null => {
            const candidates: Array<{ node: HTMLElement; score: number; textLength: number }> = [];
            let cursor: HTMLElement | null = link;

            for (let depth = 0; depth < 14 && cursor; depth++) {
              cursor = cursor.parentElement as HTMLElement | null;
              if (!cursor) break;

              const text = cleanText(cursor.textContent);
              const textLength = text.length;
              if (textLength < 40 || textLength > 2000) continue;

              const postLinks = cursor.querySelectorAll(postLinkSelector).length;
              if (postLinks !== 1) continue;

              let score = 0;
              if (/\bmore\b/i.test(text)) score += 3;
              if (/\b(?:like|reply|repost|share|views?)\b/i.test(text)) score += 2;
              if (/\bfollow\b/i.test(text)) score += 1;
              score -= Math.floor(depth / 4);

              candidates.push({ node: cursor, score, textLength });
            }

            if (candidates.length === 0) return null;

            candidates.sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.textLength - b.textLength;
            });

            return candidates[0]?.node ?? null;
          };

          const extractBodyFromContainerText = (fullText: string): string | null => {
            let text = cleanText(fullText);
            if (!text) return null;

            text = text.replace(/^Follow[\s\S]*?More/i, "").trim();

            const moreMatch = text.match(/More/i);
            if (moreMatch && typeof moreMatch.index === "number" && moreMatch.index < 180) {
              text = text.slice(moreMatch.index + moreMatch[0].length);
            }

            const footerMatch = text.match(/(?:Like|Reply|Repost|Share|View|Views)/i);
            if (footerMatch && typeof footerMatch.index === "number") {
              text = text.slice(0, footerMatch.index);
            }

            text = text
              .replace(/\b(?:Translate|See translation)\b/gi, " ")
              .replace(/\b(?:Post is shared to Fediverse|Post will be shared to Fediverse)\b/gi, " ")
              .replace(/\bUMKMthreads\b/gi, " ")
              .replace(/\s+/g, " ")
              .trim();

            return text.length > 0 ? text : null;
          };

          const links = (window as any).document.querySelectorAll(postLinkSelector);

          for (const link of Array.from(links) as HTMLElement[]) {
            const href = link.getAttribute("href");
            if (!href) continue;

            const absoluteUrl = href.startsWith("http") ? href : `${homeUrl}${href}`;
            const match = absoluteUrl.match(/\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/);
            if (!match || !match[1] || !match[2]) continue;

            const authorHandle: string = match[1];
            const platformPostId: string = match[2];

            const container = pickPostContainer(link);
            if (!container) continue;

            let bodyText = extractBodyFromContainerText(container.textContent || "");
            if (bodyText && authorHandle) {
              bodyText = bodyText.replace(new RegExp(`^@?${authorHandle}\\b`, "i"), "").trim();
            }

            results.push({
              platformPostId,
              authorHandle,
              bodyText,
              postUrl: absoluteUrl,
            });
          }

          return results;
        }, THREADS_SELECTORS.HOME_URL);

        logger.debug({ source, pass, extracted: posts.length }, "Threads extraction pass complete");

        for (const post of posts) {
          if (!post.platformPostId) continue;
          const normalizedBody = this.sanitizeBodyText(post.bodyText);
          
          if (postById.has(post.platformPostId)) {
            const existing = postById.get(post.platformPostId)!;
            const betterBody = this.pickBetterBodyText(existing.bodyText ?? null, normalizedBody ?? "");
            if (betterBody !== existing.bodyText) {
              existing.bodyText = betterBody;
            }
            continue;
          }

          postById.set(post.platformPostId, {
            platformPostId: post.platformPostId,
            authorHandle: post.authorHandle,
            authorDisplayName: post.authorHandle,
            bodyText: normalizedBody,
            contentHash: "",
            postUrl: post.postUrl,
            threadRootPlatformPostId: null,
            publishedAt: null,
            mediaUrls: [],
          });
        }

        if (postById.size >= maxPosts || postById.size === previousUniqueCount) break;
        previousUniqueCount = postById.size;

        await page.mouse.wheel(0, 2200);
        await page.waitForTimeout(1000);
        
        const currentUrl = page.url();
        const blockStatus = detectBlockChallenge(currentUrl);
        if (blockStatus.isBlocked) {
          logger.error(
            { url: currentUrl, source, pass, reason: blockStatus.reason, stage: "scroll" },
            "Threads block/challenge detected during scroll"
          );
          break;
        }
      }

      const resultPosts = Array.from(postById.values()).slice(0, maxPosts);
      
      const withBody = resultPosts.filter(p => p.bodyText && p.bodyText.length > 0).length;
      logger.debug({ 
        source, 
        collected: resultPosts.length, 
        withBodyText: withBody,
        withoutBodyText: resultPosts.length - withBody,
        navigationTimeoutCount 
      }, "Threads posts collected");
      
      return resultPosts;
    } catch (error) {
      this.logBlockTelemetry(page, source, { error: String(error) });
      logger.error({ error, source, navigationTimeoutCount }, "Failed to collect Threads posts");
      throw new NavigationError("Failed to collect Threads posts", "COLLECT_POSTS_FAILED");
    }
  }

  private pickBetterBodyText(current: string | null, candidate: string): string | null {
    const cleaned = this.sanitizeBodyText(candidate);
    if (!cleaned) return current;
    if (/^\d+[smhdwy]$/i.test(cleaned)) return current;
    if (/^\d{2}\/\d{2}\/\d{2}$/i.test(cleaned)) return current;
    if (/^(repost|reply|like|view)s?$/i.test(cleaned)) return current;

    if (!current) return cleaned;
    return cleaned.length > current.length ? cleaned : current;
  }

  private sanitizeBodyText(input: string | null): string | null {
    if (!input) return null;

    let cleaned = input.replace(/\s+/g, " ").trim();
    cleaned = cleaned
      .replace(/^Follow[\s\S]*?More/gi, " ")
      .replace(/(?:follow|more|verified)/gi, " ")
      .replace(/(?:like|reply|repost|share|view|views)\s*\d*(?:[.,]\d+)?[KMB]?/gi, " ")
      .replace(/\b(?:translate|see translation)\b/gi, " ")
      .replace(/\b(?:post is shared to fediverse|post will be shared to fediverse)\b/gi, " ")
      .replace(/\bpost\s+(?:is|will)\s+shared\b[^.]*/gi, " ")
      .replace(/\bUMKMthreads\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 3) return null;
    if (/^[A-Za-z0-9._]+\s+post\s+is\b/i.test(cleaned)) return null;
    if (/^post\s+(?:is|will)\b/i.test(cleaned)) return null;
    if (/^\d+[smhdwy]$/i.test(cleaned)) return null;
    if (/^\d+(?:[.,]\d+)?[KMB]?$/i.test(cleaned)) return null;
    return cleaned;
  }

  async expandThreadComments(
    page: Page,
    post: CollectedPost,
    options: CollectCommentOptions
  ): Promise<CollectedComment[]> {
    logger.debug({ postId: post.platformPostId }, "Expanding thread comments");
    const maxComments = options.maxComments ?? 50;

    if (!post.postUrl) {
      logger.debug({ postId: post.platformPostId }, "Skipping comment extraction because post URL is missing");
      return [];
    }

    try {
      const currentUrl = page.url();
      const isAlreadyOnPost = currentUrl === post.postUrl;
      
      if (isAlreadyOnPost) {
        logger.debug({ postId: post.platformPostId }, "Already on post page, skipping navigation");
      } else {
        await page.goto(post.postUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => undefined);
        await page.waitForTimeout(800);
      }
      
      this.logBlockTelemetry(page, `comments:${post.platformPostId}`);

      let expandClicks = 0;
      for (let pass = 0; pass < 6; pass++) {
        const expandCandidates = page.locator(THREADS_SELECTORS.COMMENTS.LOAD_MORE_COMMENTS);
        const count = await expandCandidates.count();
        if (count === 0) {
          await page.mouse.wheel(0, 1400);
          await page.waitForTimeout(600);
          continue;
        }

        let clickedInPass = 0;
        const clickLimit = Math.min(count, 4);
        for (let i = 0; i < clickLimit; i++) {
          const button = expandCandidates.nth(i);
          try {
            if (await button.isVisible({ timeout: 600 })) {
              await button.click({ timeout: 1200 });
              clickedInPass++;
              expandClicks++;
              await page.waitForTimeout(700);
            }
          } catch {
          }
        }

        if (clickedInPass === 0) {
          await page.mouse.wheel(0, 1600);
          await page.waitForTimeout(700);
        }
      }

      type RawExtractedComment = {
        platformCommentId: string | null;
        authorHandle: string;
        authorDisplayName: string;
        bodyText: string | null;
        commentUrl: string | null;
        publishedAt: number | null;
        mediaUrls: string[];
      };

      const extractedComments = await page.evaluate(
        ({ max, postUrl, homeUrl }): RawExtractedComment[] => {
          const cleanText = (value: string | null | undefined): string =>
            (value || "").replace(/\s+/g, " ").trim();

          const toAbsoluteUrl = (href: string | null | undefined): string | null => {
            if (!href) return null;
            if (/^https?:\/\//i.test(href)) return href;
            if (href.startsWith("/")) return `${homeUrl}${href}`;
            return null;
          };

          const extractHandleFromHref = (href: string | null | undefined): string | null => {
            if (!href) return null;
            const match = href.match(/\/@([^/?#]+)/);
            return match?.[1] || null;
          };

          const sanitizeBodyCandidate = (value: string, authorHandle: string, authorDisplayName: string): string => {
            let body = cleanText(value);
            if (!body) return "";

            const escapedHandle = authorHandle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const escapedDisplay = authorDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (escapedHandle) {
              body = body.replace(new RegExp(`@?${escapedHandle}`, "gi"), " ");
            }
            if (escapedDisplay) {
              body = body.replace(new RegExp(`${escapedDisplay}`, "gi"), " ");
            }

            body = body
              .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
              .replace(/([A-Za-z])(\d+\s*[smhdwy])/g, "$1 $2")
              .replace(/(\d+\s*[smhdwy])([A-Za-z])/g, "$1 $2")
              .replace(/liked by original author/gi, " ")
              .replace(/post is shared to fediverse/gi, " ")
              .replace(/audio is muted/gi, " ")
              .replace(/view activity/gi, " ")
              .replace(/follow|more|verified|author|translate|see translation|top/gi, " ")
              .replace(/like|reply|repost|share|view|views/gi, " ")
              .replace(/\b\d+\s*(?:second|minute|hour|day|week|month|year)s?\b/gi, " ")
              .replace(/\b\d+\s*[smhdwy]\b/gi, " ")
              .replace(/\b\d+\s*[jm]\b/gi, " ")
              .replace(/\b\d+(?:[.,]\d+)?[KMB]?\b/g, " ")
              .replace(/[|.,;:]+$/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            if (/^\d+\s*[smhdwy]$/i.test(body)) return "";
            if (/^\d+\s*(?:second|minute|hour|day|week|month|year)s?$/i.test(body)) return "";
            if (/^\d+\s*[jm]$/i.test(body)) return "";
            return body;
          };

          const targetPostId = postUrl.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] || null;

          const pickCommentContainer = (postLink: HTMLAnchorElement, commentPostId: string): HTMLElement | null => {
            let cursor: HTMLElement | null = postLink;
            const candidates: Array<{ node: HTMLElement; score: number; length: number }> = [];

            for (let depth = 0; depth < 16 && cursor; depth++) {
              cursor = cursor.parentElement as HTMLElement | null;
              if (!cursor) break;

              const text = cleanText(cursor.textContent);
              const length = text.length;
              if (length < 10 || length > 2200) continue;

              const postLinks = Array.from(cursor.querySelectorAll('a[href*="/post/"]')) as HTMLAnchorElement[];
              const matchingPostLinks = postLinks.filter((node) => {
                const href = node.getAttribute("href") || "";
                return href.includes(`/post/${commentPostId}`);
              });
              if (matchingPostLinks.length === 0) continue;
              if (postLinks.length > 4) continue;

              const authorLinks = cursor.querySelectorAll('a[href^="/@"]:not([href*="/post/"])').length;
              if (authorLinks === 0) continue;

              let score = 0;
              if (matchingPostLinks.length === 1) score += 3;
              if (postLinks.length <= 2) score += 2;
              if (cursor.querySelector("time")) score += 1;
              if (/\bmore\b/i.test(text)) score += 1;
              score -= Math.floor(depth / 3);

              candidates.push({ node: cursor, score, length });
            }

            if (candidates.length === 0) return null;
            candidates.sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.length - b.length;
            });
            return candidates[0]?.node || null;
          };

          const items: RawExtractedComment[] = [];
          const seen = new Set<string>();

          const postLinks = Array.from(document.querySelectorAll('a[href*="/post/"]')) as HTMLAnchorElement[];
          for (const postLink of postLinks) {
            if (items.length >= max) break;

            const postHref = postLink.getAttribute("href") || "";
            const platformCommentId = postHref.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] || null;
            if (!platformCommentId) continue;
            if (targetPostId && platformCommentId === targetPostId) continue;

            const container = pickCommentContainer(postLink, platformCommentId);
            if (!container) continue;

            const authorLink = container.querySelector('a[href^="/@"]:not([href*="/post/"])') as HTMLAnchorElement | null;
            if (!authorLink) continue;

            const href = authorLink.getAttribute("href") || "";
            const authorHandle = cleanText(extractHandleFromHref(href));
            if (!authorHandle) continue;

            const authorDisplayName = cleanText(authorLink.textContent) || authorHandle;

            const textCandidates = Array.from(container.querySelectorAll('span[dir="auto"], div[dir="auto"]'))
              .map((el) => cleanText(el.textContent))
              .filter((text) => text.length > 0)
              .filter((text) => {
                if (text === authorDisplayName) return false;
                if (text === authorHandle || text === `@${authorHandle}`) return false;
                if (/^[\d.,]+[KMB]?$/i.test(text)) return false;
                if (/^\d+\s*[smhdwy]$/i.test(text)) return false;
                if (/^\d+\s*(second|minute|hour|day|week|month|year)s?$/i.test(text)) return false;
                if (new RegExp(`^@?${authorHandle}\\s*\\d+\\s*[smhdwy]$`, "i").test(text)) return false;
                if (new RegExp(`^${authorDisplayName}\\s*\\d+\\s*[smhdwy]$`, "i").test(text)) return false;
                if (/^(like|reply|repost|view)s?$/i.test(text)) return false;
                return true;
              });

            const bodyFromNodes =
              textCandidates.length > 0 ? textCandidates.sort((a, b) => b.length - a.length)[0] || "" : "";
            const normalizedBodyFromNodes = sanitizeBodyCandidate(bodyFromNodes, authorHandle, authorDisplayName);
            const bodyFromContainer = sanitizeBodyCandidate(container.textContent || "", authorHandle, authorDisplayName);

            const pickedBody =
              bodyFromContainer.length > normalizedBodyFromNodes.length ? bodyFromContainer : normalizedBodyFromNodes;
            const bodyText = pickedBody || null;

            if (!bodyText) continue;
            if (bodyText && /^\d+\s*[smhdwy]$/i.test(bodyText)) continue;
            if (bodyText && /^\d+\s*(second|minute|hour|day|week|month|year)s?$/i.test(bodyText)) continue;
            if (bodyText.replace(/[^A-Za-z0-9]/g, "").length < 2) continue;

            const datetime = (container.querySelector("time") as HTMLTimeElement | null)?.getAttribute("datetime") || null;
            const publishedAt = datetime ? Math.floor(new Date(datetime).getTime() / 1000) : null;

            const mediaUrls: string[] = [];
            const commentUrl = toAbsoluteUrl(postHref);

            if (!bodyText && mediaUrls.length === 0) continue;

            const dedupeKey = platformCommentId || `${authorHandle}|${bodyText || ""}|${publishedAt || 0}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            items.push({
              platformCommentId,
              authorHandle,
              authorDisplayName,
              bodyText,
              commentUrl,
              publishedAt,
              mediaUrls,
            });
          }

          return items;
        },
        { max: maxComments, postUrl: post.postUrl, homeUrl: THREADS_SELECTORS.HOME_URL },
      );

      logger.debug(
        {
          postId: post.platformPostId,
          postUrl: post.postUrl,
          expandClicks,
          extractedComments: extractedComments.length,
        },
        "Thread comments extraction completed",
      );

      return extractedComments.map((comment) => ({
        ...comment,
        contentHash: "",
      }));
    } catch (error) {
      logger.debug({ error, postId: post.platformPostId, postUrl: post.postUrl }, "Failed to expand thread comments");
      return [];
    }
  }

  async extractMetrics(page: Page, entityType: "post" | "comment", entityRef: string): Promise<MetricSnapshot> {
    logger.debug({ entityType, entityRef }, "Extracting metrics");

    if (!entityRef.startsWith("http")) {
      entityRef = `${THREADS_SELECTORS.HOME_URL}${entityRef}`;
    }

    try {
      const currentUrl = page.url();
      const isAlreadyOnPage = currentUrl === entityRef;
      
      if (!isAlreadyOnPage) {
        await page.goto(entityRef, { waitUntil: "domcontentloaded", timeout: 3500 });
        await page.waitForLoadState("networkidle", { timeout: 1200 }).catch(() => undefined);
        await page.waitForTimeout(700);
      }
      
      this.logBlockTelemetry(page, `metrics:${entityType}:${entityRef}`);

      const extraction = await page.evaluate((targetUrl) => {
        const cleanText = (value: string | null | undefined): string =>
          (value || "").replace(/\s+/g, " ").trim();

        const pickContainer = (postLink: HTMLElement): HTMLElement | null => {
          const selector = 'a[href*="/post/"]:not([href*="/media"])';
          const candidates: Array<{ node: HTMLElement; score: number; length: number }> = [];
          let cursor: HTMLElement | null = postLink;

          for (let depth = 0; depth < 14 && cursor; depth++) {
            cursor = cursor.parentElement as HTMLElement | null;
            if (!cursor) break;

            const text = cleanText(cursor.textContent);
            const length = text.length;
            if (length < 30 || length > 3000) continue;

            const postLinks = cursor.querySelectorAll(selector).length;
            if (postLinks !== 1) continue;

            let score = 0;
            if (/\b(?:like|reply|repost|share|views?)\b/i.test(text)) score += 4;
            if (/\bmore\b/i.test(text)) score += 2;
            score -= Math.floor(depth / 4);

            candidates.push({ node: cursor, score, length });
          }

          if (candidates.length === 0) return null;
          candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.length - b.length;
          });

          return candidates[0]?.node ?? null;
        };

        const targetPostId = targetUrl.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] || null;
        const texts: string[] = [];
        const controlTexts: Array<{ label: string; parentText: string }> = [];

        if (targetPostId) {
          const links = document.querySelectorAll('a[href*="/post/"]');
          for (const linkNode of Array.from(links)) {
            const link = linkNode as HTMLAnchorElement;
            const href = link.getAttribute("href") || "";
            if (!href.includes(`/post/${targetPostId}`)) continue;

            const container = pickContainer(link);
            if (!container) continue;

            const text = cleanText(container.textContent);
            if (text) texts.push(text);

            const controls = Array.from(container.querySelectorAll("[aria-label]"))
              .map((node) => {
                const label = (node.getAttribute("aria-label") || "").trim();
                if (!/^(Like|Reply|Repost|Share|View activity)$/i.test(label)) return null;

                const parentText = cleanText((node.parentElement?.textContent || "").slice(0, 120));
                return { label: label.toLowerCase(), parentText };
              })
              .filter((item): item is { label: string; parentText: string } => item !== null);

            controlTexts.push(...controls);
          }
        }

        const bodyText = cleanText(document.body?.innerText || "");
        if (bodyText) texts.push(bodyText);

        if (controlTexts.length === 0) {
          const fallbackControls = Array.from(document.querySelectorAll("[aria-label]"))
            .map((node) => {
              const label = (node.getAttribute("aria-label") || "").trim();
              if (!/^(Like|Reply|Repost|Share|View activity)$/i.test(label)) return null;

              const parentText = cleanText((node.parentElement?.textContent || "").slice(0, 120));
              return {
                label: label.toLowerCase(),
                parentText,
              };
            })
            .filter((item): item is { label: string; parentText: string } => item !== null);
          controlTexts.push(...fallbackControls);
        }

        return {
          candidateTexts: Array.from(new Set(texts)),
          controlTexts,
        };
      }, entityRef);

      const candidateTexts = extraction.candidateTexts;
      const controlTexts = extraction.controlTexts;

      let bestMetrics: MetricSnapshot = {
        likesCount: null,
        repliesCount: null,
        repostsCount: null,
        viewsCount: null,
      };
      let bestScore = -1;

      for (const text of candidateTexts) {
        const parsed: MetricSnapshot = {
          likesCount: this.parseMetricByLabel(text, "like"),
          repliesCount: this.parseMetricByLabel(text, "reply"),
          repostsCount: this.parseMetricByLabel(text, "repost"),
          viewsCount: this.parseMetricByLabel(text, "view"),
        };

        const filled = [parsed.likesCount, parsed.repliesCount, parsed.repostsCount, parsed.viewsCount].filter(
          (value) => value !== null,
        ).length;
        if (filled > bestScore) {
          bestMetrics = parsed;
          bestScore = filled;
        }
      }

      const parseFromControls = (label: "like" | "reply" | "repost" | "view"): number | null => {
        const labelRegex = new RegExp(`^${label}`);
        for (const control of controlTexts) {
          if (!labelRegex.test(control.label)) continue;
          const parsed = this.parseMetricByLabel(control.parentText, label);
          if (parsed !== null) return parsed;
        }
        return null;
      };

      bestMetrics.likesCount = bestMetrics.likesCount ?? parseFromControls("like");
      bestMetrics.repliesCount = bestMetrics.repliesCount ?? parseFromControls("reply");
      bestMetrics.repostsCount = bestMetrics.repostsCount ?? parseFromControls("repost");
      bestMetrics.viewsCount = bestMetrics.viewsCount ?? parseFromControls("view");

      const primaryText = candidateTexts[0] || "";
      if (bestMetrics.likesCount === null && /\blike\b/i.test(primaryText)) bestMetrics.likesCount = 0;
      if (bestMetrics.repliesCount === null && /\breply\b/i.test(primaryText)) bestMetrics.repliesCount = 0;
      if (bestMetrics.repostsCount === null && /\brepost\b/i.test(primaryText)) bestMetrics.repostsCount = 0;

      logger.debug({ entityRef, bestScore, metrics: bestMetrics }, "Threads metrics extraction result");

      return bestMetrics;
    } catch (error) {
      logger.debug({ error }, "Failed to extract metrics");
      return { likesCount: null, repliesCount: null, repostsCount: null, viewsCount: null };
    }
  }
}
