import type { ElementHandle, Page } from "playwright";
import type { CollectedPost, CollectedComment, MetricSnapshot } from "../../domain/models";
import { THREADS_SELECTORS } from "./selectors";

type ExtractedPostData = {
  postUrl: string | null;
  platformPostId: string | null;
  authorHandle: string;
  authorDisplayName: string;
  bodyText: string | null;
  publishedAt: number | null;
  mediaUrls: string[];
};

export async function parsePostFromElement(element: ElementHandle, _page: Page): Promise<CollectedPost | null> {
  try {
    const data = await element.evaluate((node) => {
      const root = node as Element;
      const cleanText = (value: string | null | undefined): string => (value || "").replace(/\s+/g, " ").trim();

      const postLink = root.querySelector('a[href*="/post/"]') as any;
      const postHref = postLink?.getAttribute("href") || null;
      if (!postHref) return null;

      const normalizedUrl = postHref.startsWith("http") ? postHref : `https://www.threads.com${postHref}`;
      const urlMatch = normalizedUrl.match(/\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/);

      const authorLink = root.querySelector('a[href^="/@"]:not([href*="/post/"])') as any;
      const authorHref = authorLink?.getAttribute("href") || "";
      const authorFromUrl = (urlMatch?.[1] || "").replace(/^@/, "").trim();
      const authorFromLink = authorHref.replace(/^\//, "").replace(/^@/, "").split("/")[0] || "";
      const authorHandle = cleanText(authorFromUrl || authorFromLink);

      const authorDisplayName = cleanText(authorLink?.textContent) || authorHandle;

      const textNodes = Array.from(root.querySelectorAll('span[dir="auto"], div[dir="auto"]'))
        .map((el: any) => cleanText(el.textContent))
        .filter((text) => text.length > 0);

      const filteredTextNodes = textNodes.filter((text) => {
        if (!text) return false;
        if (authorHandle && (text === authorHandle || text === `@${authorHandle}`)) return false;
        if (authorDisplayName && text === authorDisplayName) return false;
        if (/^[\d.,]+[KMB]?$/i.test(text)) return false;
        if (/^(like|reply|repost|view)s?$/i.test(text)) return false;
        return true;
      });

      const bodyText = filteredTextNodes.length > 0
        ? filteredTextNodes.sort((a, b) => b.length - a.length)[0] || null
        : null;

      const timeEl = root.querySelector("time");
      const datetime = timeEl?.getAttribute("datetime") || null;
      const publishedAt = datetime ? new Date(datetime).getTime() / 1000 : null;

      const mediaUrls = Array.from(root.querySelectorAll("img[src], video[src], video[poster]"))
        .map((media: any) => {
          if (media.tagName === "IMG") return media.src;
          if (media.tagName === "VIDEO") return media.src || media.poster;
          return "";
        })
        .filter((url) => !!url);

      return {
        postUrl: normalizedUrl,
        platformPostId: urlMatch?.[2] || null,
        authorHandle,
        authorDisplayName,
        bodyText,
        publishedAt,
        mediaUrls,
      };
    });

    if (!data) return null;
    const extracted = data as ExtractedPostData;
    if (!extracted.platformPostId) return null;

    return {
      platformPostId: extracted.platformPostId,
      authorHandle: extracted.authorHandle,
      authorDisplayName: extracted.authorDisplayName,
      bodyText: extracted.bodyText,
      contentHash: "",
      postUrl: extracted.postUrl,
      threadRootPlatformPostId: null,
      publishedAt: extracted.publishedAt,
      mediaUrls: extracted.mediaUrls,
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
      contentHash: "",
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
