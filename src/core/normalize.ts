export function normalizeContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\\u200B/g, "");
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("ref");
    u.searchParams.delete("referral");
    u.searchParams.delete("source");
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("fbclid");
    u.searchParams.delete("igshid");
    return u.toString();
  } catch {
    return url;
  }
}

export function extractMediaFingerprint(mediaUrls: string[]): string {
  return mediaUrls
    .map((u) => normalizeUrl(u))
    .sort()
    .join("|");
}
