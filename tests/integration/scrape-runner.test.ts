import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { accountsRepo } from "../../src/db/repositories/accounts.repo";
import { runsRepo } from "../../src/db/repositories/runs.repo";
import { postsRepo } from "../../src/db/repositories/posts.repo";
import { commentsRepo } from "../../src/db/repositories/comments.repo";
import { logger } from "../../src/core/logger";

const uniqueId = Date.now();

describe("Database persistence integration", () => {
  let testAccountId: number;
  let db: Database;

  beforeAll(async () => {
    db = new Database("data/app.db");

    const account = await accountsRepo.create({
      platform: "threads",
      displayName: "Test Account",
      handle: `testuser-${uniqueId}`,
      status: "active",
      sessionStatePath: "./data/sessions/test-session.json",
      cooldownSeconds: 1,
    });

    testAccountId = account.id;

    logger.info({ accountId: testAccountId }, "Test setup complete");
  });

  afterAll(async () => {
    db.close();
  });

  it("should create and retrieve scrape runs", async () => {
    const run = await runsRepo.createRun({
      trigger: "manual",
      startedAt: Math.floor(Date.now() / 1000),
      status: "running",
    });

    expect(run.id).toBeGreaterThan(0);
    expect(run.trigger).toBe("manual");

    const retrieved = await runsRepo.findById(run.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(run.id);

    const runAccount = await runsRepo.createRunAccount({
      runId: run.id,
      accountId: testAccountId,
      status: "success",
      startedAt: Math.floor(Date.now() / 1000),
      postsFound: 5,
      commentsFound: 10,
      snapshotsWritten: 15,
      endedAt: Math.floor(Date.now() / 1000),
    });

    expect(runAccount.id).toBeGreaterThan(0);

    await runsRepo.markRunAccountSuccess(runAccount.id, {
      postsFound: 10,
      commentsFound: 20,
      snapshotsWritten: 30,
    });

    const recentRuns = await runsRepo.listRecent(1);
    expect(recentRuns.length).toBeGreaterThan(0);
  });

  it("should handle duplicate posts via content hash", async () => {
    const now = Math.floor(Date.now() / 1000);
    const postId1 = `test-post-${uniqueId}-1`;
    const hash1 = `hash-${uniqueId}-1`;

    const post1 = await postsRepo.create({
      platform: "threads",
      platformPostId: postId1,
      authorHandle: `author-${uniqueId}`,
      authorDisplayName: "Test User",
      bodyText: "Hello world",
      contentHash: hash1,
      postUrl: "https://threads.net/test/post/123",
      publishedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceAccountId: testAccountId,
    });

    expect(post1).not.toBeNull();
    expect(post1?.id).toBeGreaterThan(0);

    const post2 = await postsRepo.create({
      platform: "threads",
      platformPostId: postId1,
      authorHandle: `author-${uniqueId}`,
      authorDisplayName: "Test User",
      bodyText: "Hello world",
      contentHash: hash1,
      postUrl: "https://threads.net/test/post/123",
      publishedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceAccountId: testAccountId,
    });

    expect(post2).not.toBeNull();
    expect(post2?.id).toBe(post1?.id);

    const allPosts = await postsRepo.listBySourceAccount(testAccountId);
    const matchingPosts = allPosts.filter(p => p.contentHash === hash1);
    expect(matchingPosts.length).toBe(1);
  });

  it("should create and retrieve comments", async () => {
    const now = Math.floor(Date.now() / 1000);
    const postId2 = `test-post-${uniqueId}-2`;
    const hash2 = `hash-${uniqueId}-2`;
    const commentHash = `comment-hash-${uniqueId}`;

    const post = await postsRepo.create({
      platform: "threads",
      platformPostId: postId2,
      authorHandle: `author-${uniqueId}`,
      authorDisplayName: "Test User",
      bodyText: "Test post",
      contentHash: hash2,
      publishedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceAccountId: testAccountId,
    });

    expect(post?.id).toBeGreaterThan(0);

    const comment = await commentsRepo.create({
      platform: "threads",
      parentPostId: post!.id,
      authorHandle: `commenter-${uniqueId}`,
      authorDisplayName: "Commenter",
      bodyText: "Nice post!",
      contentHash: commentHash,
      publishedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceAccountId: testAccountId,
    });

    expect(comment).not.toBeNull();
    expect(comment?.id).toBeGreaterThan(0);

    const comments = await commentsRepo.findByParentPostId(post!.id);
    const matchingComments = comments.filter(c => c.contentHash === commentHash);
    expect(matchingComments.length).toBe(1);
    expect(matchingComments[0]?.authorHandle).toBe(`commenter-${uniqueId}`);
  });
});
