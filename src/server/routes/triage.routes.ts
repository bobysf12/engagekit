import { Router } from "express";
import { desc, eq, and, gte, inArray, sql } from "drizzle-orm";
import { postTriage, posts, llmDrafts } from "../../db/schema";
import { postTriageRepo } from "../../db/repositories/post-triage.repo";
import { getDb } from "../../db/client";

export const triageRoutes = Router();

// IMPORTANT: Static/specific routes must be defined BEFORE dynamic routes like /:id
// to prevent Express from matching the dynamic route first.
// For example, /run-account/123 should match /run-account/:runAccountId, not /:id

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

// Static routes with multiple path segments MUST come before /:id
// to prevent /run-account from being interpreted as an :id value

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

triageRoutes.get("/run-account/:runAccountId/review", async (req, res, next) => {
  try {
    const runAccountId = parseInt(req.params.runAccountId);
    if (isNaN(runAccountId)) {
      res.status(400).json({ error: "Invalid run account id" });
      return;
    }

    const includeDismissed = req.query.includeDismissed !== "false";
    const dismissedOnly = req.query.dismissedOnly === "true";

    const db = getDb();

    const triageRows = await db
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

    if (triageRows.length === 0) {
      res.json([]);
      return;
    }

    const postIds = triageRows.map((t) => t.postId);

    const allDrafts = await db
      .select()
      .from(llmDrafts)
      .where(
        and(
          eq(llmDrafts.runAccountId, runAccountId),
          inArray(llmDrafts.postId, postIds)
        )
      );

    const draftsByPostId = new Map<number, typeof allDrafts>();
    for (const draft of allDrafts) {
      if (draft.postId === null) continue;
      if (!draftsByPostId.has(draft.postId)) {
        draftsByPostId.set(draft.postId, []);
      }
      draftsByPostId.get(draft.postId)!.push(draft);
    }

    const result = triageRows.map((triage) => {
      const postDrafts = draftsByPostId.get(triage.postId) || [];

      let filteredDrafts = postDrafts;
      if (dismissedOnly) {
        filteredDrafts = postDrafts.filter((d) => d.status === "rejected");
      } else if (!includeDismissed) {
        filteredDrafts = postDrafts.filter((d) => d.status !== "rejected");
      }

      filteredDrafts.sort((a, b) => {
        if (a.status === "rejected" && b.status !== "rejected") return 1;
        if (a.status !== "rejected" && b.status === "rejected") return -1;
        return (a.optionIndex ?? 0) - (b.optionIndex ?? 0);
      });

      return {
        ...triage,
        drafts: filteredDrafts,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Dynamic route /:id must be defined LAST to avoid shadowing static routes
// A request like /run-account/123 would match /:id with id="run-account" if placed before

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
