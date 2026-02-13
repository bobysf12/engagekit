import { Router } from "express";
import { draftFeedbackRepo } from "../../db/repositories/draft-feedback.repo";
import { logger } from "../../core/logger";

export const draftsRoutes = Router();

draftsRoutes.get("/", async (req, res, next) => {
  try {
    const runAccountId = req.query.runAccountId ? parseInt(req.query.runAccountId as string) : undefined;
    const postId = req.query.postId ? parseInt(req.query.postId as string) : undefined;

    if (runAccountId === undefined && postId === undefined) {
      res.status(400).json({ error: "Either runAccountId or postId is required" });
      return;
    }

    if (runAccountId !== undefined && isNaN(runAccountId)) {
      res.status(400).json({ error: "Invalid run account id" });
      return;
    }

    if (postId !== undefined && isNaN(postId)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    if (runAccountId !== undefined && postId !== undefined) {
      const drafts = await draftFeedbackRepo.findDraftsByPost(runAccountId, postId);
      res.json(drafts);
      return;
    }

    res.status(400).json({ error: "Both runAccountId and postId are required for listing drafts" });
  } catch (err) {
    next(err);
  }
});

draftsRoutes.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid draft id" });
      return;
    }

    const draft = await draftFeedbackRepo.findDraftById(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }

    res.json(draft);
  } catch (err) {
    next(err);
  }
});

draftsRoutes.post("/:id/select", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid draft id" });
      return;
    }

    const draft = await draftFeedbackRepo.findDraftById(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }

    const selectedBy = req.body.selectedBy || "api";
    const metadata = req.body.metadata;

    const updated = await draftFeedbackRepo.selectDraft(id, selectedBy, metadata);
    
    if (draft.runAccountId && draft.postId) {
      const otherDrafts = await draftFeedbackRepo.findDraftsByPost(draft.runAccountId, draft.postId);
      const rejectedIds = otherDrafts
        .filter((d) => d.id !== id && d.status === "generated")
        .map((d) => d.id);

      if (rejectedIds.length > 0) {
        for (const rejectedId of rejectedIds) {
          await draftFeedbackRepo.rejectDraft(rejectedId);
        }
      }

      await draftFeedbackRepo.createSignal({
        runAccountId: draft.runAccountId,
        postId: draft.postId,
        selectedDraftId: id,
        rejectedDraftIdsJson: rejectedIds.length > 0 ? JSON.stringify(rejectedIds) : null,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      });
    }

    logger.info({ draftId: id, selectedBy }, "Draft selected via API");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

draftsRoutes.post("/:id/reject", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid draft id" });
      return;
    }

    const draft = await draftFeedbackRepo.findDraftById(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }

    const updated = await draftFeedbackRepo.rejectDraft(id);
    logger.info({ draftId: id }, "Draft rejected via API");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

draftsRoutes.get("/post/:postId/feedback", async (req, res, next) => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    const feedback = await draftFeedbackRepo.findSignalByPostId(postId);
    if (!feedback) {
      res.status(404).json({ error: "No feedback found for post" });
      return;
    }

    res.json(feedback);
  } catch (err) {
    next(err);
  }
});
