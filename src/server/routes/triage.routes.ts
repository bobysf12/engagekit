import { Router } from "express";
import { desc, eq, and, gte } from "drizzle-orm";
import { postTriage, posts } from "../../db/schema";
import { postTriageRepo } from "../../db/repositories/post-triage.repo";
import { getDb } from "../../db/client";

export const triageRoutes = Router();

triageRoutes.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const runAccountId = req.query.runAccountId ? parseInt(req.query.runAccountId as string) : undefined;
    const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : undefined;
    const label = req.query.label as "keep" | "maybe" | "drop" | undefined;
    const selectedOnly = req.query.selectedOnly === "true";

    const db = getDb();
    const conditions = [];

    if (runAccountId && !isNaN(runAccountId)) {
      conditions.push(eq(postTriage.runAccountId, runAccountId));
    }
    if (minScore !== undefined && !isNaN(minScore)) {
      conditions.push(gte(postTriage.relevanceScore, minScore));
    }
    if (label) {
      conditions.push(eq(postTriage.relevanceLabel, label));
    }
    if (selectedOnly) {
      conditions.push(eq(postTriage.selectedForDeepScrape, 1));
    }

    const result = await db
      .select({
        id: postTriage.id,
        runAccountId: postTriage.runAccountId,
        postId: postTriage.postId,
        relevanceScore: postTriage.relevanceScore,
        relevanceLabel: postTriage.relevanceLabel,
        reasonsJson: postTriage.reasonsJson,
        action: postTriage.action,
        confidence: postTriage.confidence,
        model: postTriage.model,
        promptVersion: postTriage.promptVersion,
        rank: postTriage.rank,
        isTop20: postTriage.isTop20,
        selectedForDeepScrape: postTriage.selectedForDeepScrape,
        createdAt: postTriage.createdAt,
        post: {
          id: posts.id,
          authorHandle: posts.authorHandle,
          authorDisplayName: posts.authorDisplayName,
          bodyText: posts.bodyText,
          postUrl: posts.postUrl,
          platform: posts.platform,
        },
      })
      .from(postTriage)
      .innerJoin(posts, eq(postTriage.postId, posts.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(postTriage.relevanceScore))
      .limit(limit);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

triageRoutes.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid triage id" });
      return;
    }

    const triage = await postTriageRepo.findById(id);
    if (!triage) {
      res.status(404).json({ error: "Triage record not found" });
      return;
    }

    res.json(triage);
  } catch (err) {
    next(err);
  }
});

triageRoutes.get("/run-account/:runAccountId", async (req, res, next) => {
  try {
    const runAccountId = parseInt(req.params.runAccountId);
    if (isNaN(runAccountId)) {
      res.status(400).json({ error: "Invalid run account id" });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 200);
    const triage = await postTriageRepo.listByRunAccount(runAccountId, limit);
    res.json(triage);
  } catch (err) {
    next(err);
  }
});

triageRoutes.get("/run-account/:runAccountId/top20", async (req, res, next) => {
  try {
    const runAccountId = parseInt(req.params.runAccountId);
    if (isNaN(runAccountId)) {
      res.status(400).json({ error: "Invalid run account id" });
      return;
    }

    const triage = await postTriageRepo.listTop20(runAccountId);
    res.json(triage);
  } catch (err) {
    next(err);
  }
});

triageRoutes.get("/run-account/:runAccountId/selected", async (req, res, next) => {
  try {
    const runAccountId = parseInt(req.params.runAccountId);
    if (isNaN(runAccountId)) {
      res.status(400).json({ error: "Invalid run account id" });
      return;
    }

    const db = getDb();
    const result = await db
      .select({
        id: postTriage.id,
        runAccountId: postTriage.runAccountId,
        postId: postTriage.postId,
        relevanceScore: postTriage.relevanceScore,
        relevanceLabel: postTriage.relevanceLabel,
        reasonsJson: postTriage.reasonsJson,
        action: postTriage.action,
        confidence: postTriage.confidence,
        model: postTriage.model,
        promptVersion: postTriage.promptVersion,
        rank: postTriage.rank,
        isTop20: postTriage.isTop20,
        selectedForDeepScrape: postTriage.selectedForDeepScrape,
        createdAt: postTriage.createdAt,
        post: {
          id: posts.id,
          authorHandle: posts.authorHandle,
          authorDisplayName: posts.authorDisplayName,
          bodyText: posts.bodyText,
          postUrl: posts.postUrl,
          platform: posts.platform,
        },
      })
      .from(postTriage)
      .innerJoin(posts, eq(postTriage.postId, posts.id))
      .where(and(eq(postTriage.runAccountId, runAccountId), eq(postTriage.selectedForDeepScrape, 1)))
      .orderBy(desc(postTriage.relevanceScore));

    res.json(result);
  } catch (err) {
    next(err);
  }
});
