/// <reference lib="dom" />
import type { Page } from "playwright";
import type { AuthState, CollectedPost, CollectedComment, MetricSnapshot } from "../../domain/models";
import type { PlatformAdapter, CollectPostOptions, CollectCommentOptions } from "../adapter";
import { NavigationError } from "../../core/errors";
import { THREADS_SELECTORS } from "./selectors";
import { performThreadsLogin, validateThreadsSession } from "./auth";
import { parseCommentFromElement } from "./parsers";
import { actionDelay } from "../../core/cooldown";
import { logger } from "../../core/logger";

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

  async validateSession(page: Page): Promise<AuthState> {
    logger.debug("Validating Threads session");
    return validateThreadsSession(page);
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

    try {
      for (let pass = 0; pass < 8 && postById.size < maxPosts; pass++) {
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
      }

      const resultPosts = Array.from(postById.values()).slice(0, maxPosts);
      
      // Log stats about body text extraction
      const withBody = resultPosts.filter(p => p.bodyText && p.bodyText.length > 0).length;
      logger.debug({ 
        source, 
        collected: resultPosts.length, 
        withBodyText: withBody,
        withoutBodyText: resultPosts.length - withBody 
      }, "Threads posts collected");
      
      return resultPosts;
    } catch (error) {
      logger.error({ error, source }, "Failed to collect Threads posts");
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
    const comments: CollectedComment[] = [];
    const maxComments = options.maxComments ?? 50;

    if (!post.postUrl) {
      return comments;
    }

    try {
      await page.goto(post.postUrl, { waitUntil: "domcontentloaded", timeout: 4000 });
      await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => undefined);

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

    try {
      await page.goto(entityRef, { waitUntil: "domcontentloaded", timeout: 3500 });
      await page.waitForLoadState("networkidle", { timeout: 1200 }).catch(() => undefined);
      await page.waitForTimeout(700);

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
