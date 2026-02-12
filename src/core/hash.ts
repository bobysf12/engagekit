import crypto from "crypto";
import { normalizeContent, extractMediaFingerprint } from "./normalize";

export function computeContentHash(content: string, mediaUrls: string[] = []): string {
  const normalized = normalizeContent(content);
  const mediaFingerprint = extractMediaFingerprint(mediaUrls);
  const data = mediaFingerprint ? `${normalized}|${mediaFingerprint}` : normalized;
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function computeSnapshotHash(data: unknown): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return crypto.createHash("sha256").update(str).digest("hex");
}
