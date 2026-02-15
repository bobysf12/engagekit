import { Router } from "express";
import { desc, eq, and, sql } from "drizzle-orm";
import { posts } from "../../db/schema";
import { postsRepo } from "../../db/repositories/posts.repo";
import { commentsRepo } from "../../db/repositories/comments.repo";
import { deleteService } from "../../services/delete.service";
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

    const db = getDb();
    let query = db.select().from(posts);

    const conditions = [];
    if (platform) {
      conditions.push(eq(posts.platform, platform));
    }
    if (sourceAccountId && !isNaN(sourceAccountId)) {
      conditions.push(eq(posts.sourceAccountId, sourceAccountId));
    }

    const result = await db
      .select()
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
