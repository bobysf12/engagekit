import { describe, it, expect } from "bun:test";
import { computeContentHash, computeSnapshotHash } from "../../src/core/hash";
import { normalizeContent, normalizeUrl, extractMediaFingerprint } from "../../src/core/normalize";

describe("Hash utilities", () => {
  describe("computeContentHash", () => {
    it("should produce consistent hashes for the same content", () => {
      const content = "Hello, world!";
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different content", () => {
      const hash1 = computeContentHash("Hello, world!");
      const hash2 = computeContentHash("Goodbye, world!");
      expect(hash1).not.toBe(hash2);
    });

    it("should include media fingerprint in hash", () => {
      const content = "Hello";
      const hash1 = computeContentHash(content, ["img1.jpg"]);
      const hash2 = computeContentHash(content, ["img2.jpg"]);
      expect(hash1).not.toBe(hash2);
    });

    it("should be deterministic with empty media", () => {
      const content = "Hello";
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content, []);
      expect(hash1).toBe(hash2);
    });
  });

  describe("computeSnapshotHash", () => {
    it("should hash objects consistently", () => {
      const obj = { foo: "bar", num: 42 };
      const hash1 = computeSnapshotHash(obj);
      const hash2 = computeSnapshotHash(obj);
      expect(hash1).toBe(hash2);
    });

    it("should hash strings", () => {
      const str = "some string";
      const hash1 = computeSnapshotHash(str);
      const hash2 = computeSnapshotHash(str);
      expect(hash1).toBe(hash2);
    });
  });
});

describe("Normalize utilities", () => {
  describe("normalizeContent", () => {
    it("should trim and collapse whitespace", () => {
      const result = normalizeContent("  Hello   world  ");
      expect(result).toBe("hello world");
    });

    it("should lowercase content", () => {
      const result = normalizeContent("HELLO WORLD");
      expect(result).toBe("hello world");
    });

    it("should remove zero-width characters", () => {
      const result = normalizeContent("Hello\u200Bworld");
      expect(result).toBe("helloworld");
    });
  });

  describe("normalizeUrl", () => {
    it("should remove tracking parameters", () => {
      const url = "https://example.com/post?ref=twitter&utm_source=ads";
      const result = normalizeUrl(url);
      expect(result).not.toContain("ref=");
      expect(result).not.toContain("utm_source=");
    });

    it("should preserve URL without tracking params", () => {
      const url = "https://example.com/post?id=123";
      const result = normalizeUrl(url);
      expect(result).toBe("https://example.com/post?id=123");
    });

    it("should handle invalid URLs gracefully", () => {
      const url = "not-a-url";
      const result = normalizeUrl(url);
      expect(result).toBe("not-a-url");
    });
  });

  describe("extractMediaFingerprint", () => {
    it("should sort and normalize media URLs", () => {
      const urls = [
        "https://example.com/img2.jpg?ref=twitter",
        "https://example.com/img1.jpg",
      ];
      const result = extractMediaFingerprint(urls);
      expect(result).toContain("img1.jpg");
      expect(result).toContain("img2.jpg");
      expect(result.indexOf("img1.jpg")).toBeLessThan(result.indexOf("img2.jpg"));
      expect(result).not.toContain("ref=");
    });

    it("should return empty string for empty array", () => {
      const result = extractMediaFingerprint([]);
      expect(result).toBe("");
    });
  });
});
