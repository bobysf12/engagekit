import { describe, it, expect, beforeAll } from "bun:test";
import { metricsRepo } from "../../src/db/repositories/metrics.repo";
import { postsRepo } from "../../src/db/repositories/posts.repo";
import { commentsRepo } from "../../src/db/repositories/comments.repo";
import { accountsRepo } from "../../src/db/repositories/accounts.repo";

describe("Comment metrics ingestion", () => {
  let testAccountId: number;
  let testPostId: number;
  let testCommentId: number;

  beforeAll(async () => {
    const uniqueId = Date.now();

    const account = await accountsRepo.create({
      platform: "threads",
      displayName: "Test Account",
      handle: `test-metrics-${uniqueId}`,
      status: "active",
      sessionStatePath: "./data/sessions/test-session.json",
      cooldownSeconds: 1,
    });
    testAccountId = account.id;

    const now = Math.floor(Date.now() / 1000);
    const post = await postsRepo.create({
      platform: "threads",
      platformPostId: `test-post-metrics-${uniqueId}`,
      authorHandle: "testuser",
      authorDisplayName: "Test User",
      bodyText: "Test post for metrics",
      contentHash: `hash-post-${uniqueId}`,
      postUrl: "https://threads.net/test/post/123",
      publishedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceAccountId: testAccountId,
    });
    if (!post) {
      throw new Error("Failed to create test post");
    }
    testPostId = post.id;

    const comment = await commentsRepo.create({
      platform: "threads",
      platformCommentId: `test-comment-metrics-${uniqueId}`,
      parentPostId: testPostId,
      authorHandle: "commenter",
      authorDisplayName: "Commenter",
      bodyText: "Test comment",
      contentHash: `hash-comment-${uniqueId}`,
      commentUrl: "https://threads.net/test/comment/456",
      publishedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceAccountId: testAccountId,
    });
    if (!comment) {
      throw new Error("Failed to create test comment");
    }
    testCommentId = comment.id;
  });

  it("should create comment metric snapshot", async () => {
    const now = Math.floor(Date.now() / 1000);
    
    const metric = await metricsRepo.create({
      entityType: "comment",
      entityId: testCommentId,
      likesCount: 5,
      repliesCount: 2,
      repostsCount: null,
      viewsCount: 100,
      capturedAt: now,
      runAccountId: 1,
    });

    expect(metric).toBeDefined();
    expect(metric.id).toBeGreaterThan(0);
    expect(metric.entityType).toBe("comment");
    expect(metric.entityId).toBe(testCommentId);
    expect(metric.likesCount).toBe(5);
    expect(metric.repliesCount).toBe(2);
    expect(metric.repostsCount).toBeNull();
    expect(metric.viewsCount).toBe(100);
  });

  it("should retrieve comment metrics by entity", async () => {
    const metrics = await metricsRepo.findByEntity("comment", testCommentId, 10);
    
    expect(metrics.length).toBeGreaterThan(0);
    const firstMetric = metrics[0];
    expect(firstMetric).toBeDefined();
    expect(firstMetric?.entityType).toBe("comment");
    expect(firstMetric?.entityId).toBe(testCommentId);
  });

  it("should retrieve latest comment metric", async () => {
    const latest = await metricsRepo.findLatestByEntity("comment", testCommentId);
    
    expect(latest).not.toBeNull();
    expect(latest?.entityType).toBe("comment");
    expect(latest?.entityId).toBe(testCommentId);
  });

  it("should handle null metric values for comments", async () => {
    const now = Math.floor(Date.now() / 1000) + 1000;
    
    const metric = await metricsRepo.create({
      entityType: "comment",
      entityId: testCommentId,
      likesCount: null,
      repliesCount: null,
      repostsCount: null,
      viewsCount: null,
      capturedAt: now,
      runAccountId: 2,
    });

    expect(metric).toBeDefined();
    expect(metric.likesCount).toBeNull();
    expect(metric.repliesCount).toBeNull();
    expect(metric.repostsCount).toBeNull();
    expect(metric.viewsCount).toBeNull();
  });
});
