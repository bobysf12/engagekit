import { Router } from "express";
import { desc, eq, and, sql } from "drizzle-orm";
import { posts } from "../../db/schema";
import { postsRepo } from "../../db/repositories/posts.repo";
import { commentsRepo } from "../../db/repositories/comments.repo";
import { deleteService } from "../../services/delete.service";
import { postWorkspaceService } from "../../services/post-workspace.service";
import { getDb } from "../../db/client";
import { logger } from "../../core/logger";

export const postsRoutes = Router();

// IMPORTANT: Static/specific routes must be defined BEFORE dynamic routes like /:id
// to prevent Express from matching the dynamic route first.

postsRoutes.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const platform = req.query.platform as string;
    const sourceAccountId = req.query.sourceAccountId ? parseInt(req.query.sourceAccountId as string) : undefined;
    const engaged = req.query.engaged === "true" ? true : req.query.engaged === "false" ? false : undefined;

    const db = getDb();

    const conditions = [];
    if (platform) {
      conditions.push(eq(posts.platform, platform));
    }
    if (sourceAccountId && !isNaN(sourceAccountId)) {
      conditions.push(eq(posts.sourceAccountId, sourceAccountId));
    }
    if (engaged !== undefined) {
      conditions.push(eq(posts.engaged, engaged ? 1 : 0));
    }

    const result = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        platformPostId: posts.platformPostId,
        authorHandle: posts.authorHandle,
        authorDisplayName: posts.authorDisplayName,
        bodyText: posts.bodyText,
        contentHash: posts.contentHash,
        contentHashAlg: posts.contentHashAlg,
        postUrl: posts.postUrl,
        threadRootPlatformPostId: posts.threadRootPlatformPostId,
        publishedAt: posts.publishedAt,
        firstSeenAt: posts.firstSeenAt,
        lastSeenAt: posts.lastSeenAt,
        sourceAccountId: posts.sourceAccountId,
        engaged: posts.engaged,
        engagedAt: posts.engagedAt,
        engagedBy: posts.engagedBy,
        triageScore: sql<number | null>`(
          SELECT pt.relevance_score 
          FROM post_triage pt 
          WHERE pt.post_id = posts.id 
          ORDER BY pt.created_at DESC 
          LIMIT 1
        )`,
        triageLabel: sql<string | null>`(
          SELECT pt.relevance_label 
          FROM post_triage pt 
          WHERE pt.post_id = posts.id 
          ORDER BY pt.created_at DESC 
          LIMIT 1
        )`,
        triageAction: sql<string | null>`(
          SELECT pt.action 
          FROM post_triage pt 
          WHERE pt.post_id = posts.id 
          ORDER BY pt.created_at DESC 
          LIMIT 1
        )`,
      })
      .from(posts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(posts.firstSeenAt))
      .limit(limit)
      .offset(offset);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Nested routes like /:id/comments MUST come BEFORE /:id
// Otherwise /123/comments matches /:id with id="123/comments"

postsRoutes.get("/:id/comments", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const post = await postsRepo.findById(id);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const comments = await commentsRepo.findByParentPostId(id);
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

postsRoutes.get("/:id/workspace", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const workspace = await postWorkspaceService.getWorkspace(id);
    if (!workspace) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    res.json(workspace);
  } catch (err) {
    next(err);
  }
});

postsRoutes.put("/:id/engagement", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const { engaged, engagedBy } = req.body;
    if (typeof engaged !== "boolean") {
      res.status(400).json({ error: "engaged must be a boolean" });
      return;
    }

    const post = await postsRepo.findById(id);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const updated = await postWorkspaceService.setEngagement(id, engaged, engagedBy);
    logger.info({ postId: id, engaged }, "Post engagement updated via API");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

postsRoutes.post("/:id/generate-drafts", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const result = await postWorkspaceService.generateDrafts(id);
    logger.info({ postId: id, runAccountId: result.runAccountId }, "Generated drafts via API");
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("disabled")) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes("no source account")) {
      res.status(422).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// Dynamic routes /:id must be defined LAST

postsRoutes.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const post = await postsRepo.findById(id);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const comments = await commentsRepo.findByParentPostId(id);
    res.json({ ...post, comments });
  } catch (err) {
    next(err);
  }
});

postsRoutes.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const post = await postsRepo.findById(id);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    await deleteService.deletePost(id);
    logger.info({ postId: id }, "Post deleted via API");
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});
