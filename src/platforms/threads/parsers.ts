import type { ElementHandle, Page } from "playwright";
import type { CollectedPost, CollectedComment, MetricSnapshot } from "../../domain/models";
import { THREADS_SELECTORS, THREADS_SELECTORS_FALLBACK } from "./selectors";

export async function parsePostFromElement(element: ElementHandle, page: Page): Promise<CollectedPost | null> {
  try {
    const authorHandleEl = await element.$(THREADS_SELECTORS.POSTS.POST_AUTHOR);
    const authorDisplayNameEl = await element.$(THREADS_SELECTORS.POSTS.POST_AUTHOR);
    const textEl = await element.$(THREADS_SELECTORS.POSTS.POST_TEXT);
    const linkEl = await element.$(THREADS_SELECTORS.POSTS.POST_LINK);

    if (!authorHandleEl) return null;

    const authorHandle = await authorHandleEl.textContent();
    const authorDisplayName = await authorDisplayNameEl?.textContent();
    const bodyText = await textEl?.textContent();
    const postUrl = await linkEl?.getAttribute("href");

    const mediaEls = await element.$$(THREADS_SELECTORS.POSTS.POST_MEDIA);
    const mediaUrls: string[] = [];
    for (const media of mediaEls) {
      const src = await media.getAttribute("src");
      if (src) mediaUrls.push(src);
    }

    const linkText = postUrl || "";
    const urlMatch = linkText.match(/\/post\/(\w+)/);
    const platformPostId: string | null = urlMatch?.[1] ?? null;

    const timestampEl = await element.$(THREADS_SELECTORS.POSTS.POST_TIMESTAMP);
    const datetime = await timestampEl?.getAttribute("datetime");
    const publishedAt = datetime ? new Date(datetime).getTime() / 1000 : null;

    return {
      platformPostId,
      authorHandle: authorHandle?.replace(/^@/, "") || "",
      authorDisplayName: authorDisplayName || authorHandle || "",
      bodyText: bodyText || null,
      contentHash: "", // Will be computed by caller
      postUrl: postUrl ? `https://www.threads.net${postUrl}` : null,
      threadRootPlatformPostId: null,
      publishedAt,
      mediaUrls,
    };
  } catch {
    return null;
  }
}

export async function parseCommentFromElement(
  element: ElementHandle,
  parentPostId: number
): Promise<CollectedComment | null> {
  try {
    const authorHandleEl = await element.$(THREADS_SELECTORS.COMMENTS.COMMENT_AUTHOR_LINK);
    const textEl = await element.$(THREADS_SELECTORS.COMMENTS.COMMENT_TEXT);
    const timestampEl = await element.$(THREADS_SELECTORS.COMMENTS.COMMENT_TIMESTAMP);

    if (!authorHandleEl) return null;

    const authorHandle = await authorHandleEl.textContent();
    const bodyText = await textEl?.textContent();
    const datetime = await timestampEl?.getAttribute("datetime");
    const publishedAt = datetime ? new Date(datetime).getTime() / 1000 : null;

    const mediaEls = await element.$$(THREADS_SELECTORS.COMMENTS.COMMENT_MEDIA);
    const mediaUrls: string[] = [];
    for (const media of mediaEls) {
      const src = await media.getAttribute("src");
      if (src) mediaUrls.push(src);
    }

    return {
      platformCommentId: null,
      authorHandle: authorHandle?.replace(/^@/, "") || "",
      authorDisplayName: authorHandle || "",
      bodyText: bodyText || null,
      contentHash: "", // Will be computed by caller
      commentUrl: null,
      publishedAt,
      mediaUrls,
    };
  } catch {
    return null;
  }
}

export async function extractMetricsFromElement(
  element: ElementHandle
): Promise<MetricSnapshot> {
  const likesEl = await element.$(THREADS_SELECTORS.POSTS.POST_LIKES);
  const repliesEl = await element.$(THREADS_SELECTORS.POSTS.POST_REPLIES);
  const repostsEl = await element.$(THREADS_SELECTORS.POSTS.POST_REPOSTS);
  const viewsEl = await element.$(THREADS_SELECTORS.POSTS.POST_VIEWS);

  const parseNumber = async (el: ElementHandle | null): Promise<number | null> => {
    if (!el) return null;
    const text = await el.textContent();
    if (!text) return null;
    const cleaned = text.replace(/[^\d.KkMmBb]/g, "").toUpperCase();
    if (!cleaned) return null;

    if (cleaned.endsWith("K")) {
      return parseFloat(cleaned.slice(0, -1)) * 1000;
    }
    if (cleaned.endsWith("M")) {
      return parseFloat(cleaned.slice(0, -1)) * 1000000;
    }
    if (cleaned.endsWith("B")) {
      return parseFloat(cleaned.slice(0, -1)) * 1000000000;
    }
    return parseInt(cleaned, 10);
  };

  return {
    likesCount: await parseNumber(likesEl),
    repliesCount: await parseNumber(repliesEl),
    repostsCount: await parseNumber(repostsEl),
    viewsCount: await parseNumber(viewsEl),
  };
}
