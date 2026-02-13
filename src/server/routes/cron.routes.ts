import { Router } from "express";
import { cronJobsRepo } from "../../db/repositories/cron-jobs.repo";
import { logger } from "../../core/logger";

export const cronRoutes = Router();

cronRoutes.get("/", async (req, res, next) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;

    if (accountId !== undefined) {
      if (isNaN(accountId)) {
        res.status(400).json({ error: "Invalid account id" });
        return;
      }
      const jobs = await cronJobsRepo.listJobsByAccount(accountId);
      res.json(jobs);
      return;
    }

    const jobs = await cronJobsRepo.listEnabledJobs();
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

cronRoutes.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid cron job id" });
      return;
    }

    const job = await cronJobsRepo.findJobById(id);
    if (!job) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    res.json(job);
  } catch (err) {
    next(err);
  }
});

cronRoutes.post("/", async (req, res, next) => {
  try {
    const { accountId, name, cronExpr, timezone, pipelineConfig } = req.body;

    if (!accountId || !name || !cronExpr) {
      res.status(400).json({ error: "accountId, name, and cronExpr are required" });
      return;
    }

    const job = await cronJobsRepo.createJob({
      accountId,
      name,
      cronExpr,
      timezone: timezone || "UTC",
      enabled: 1,
      pipelineConfigJson: pipelineConfig ? JSON.stringify(pipelineConfig) : null,
    });

    logger.info({ jobId: job.id, accountId }, "Cron job created via API");
    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

cronRoutes.put("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid cron job id" });
      return;
    }

    const job = await cronJobsRepo.findJobById(id);
    if (!job) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    const { name, cronExpr, timezone, pipelineConfig } = req.body;

    const updated = await cronJobsRepo.updateJob(id, {
      name,
      cronExpr,
      timezone,
      pipelineConfigJson: pipelineConfig !== undefined ? JSON.stringify(pipelineConfig) : undefined,
    });

    logger.info({ jobId: id }, "Cron job updated via API");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

cronRoutes.post("/:id/enable", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid cron job id" });
      return;
    }

    const job = await cronJobsRepo.findJobById(id);
    if (!job) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    const updated = await cronJobsRepo.enableJob(id);
    logger.info({ jobId: id }, "Cron job enabled via API");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

cronRoutes.post("/:id/disable", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid cron job id" });
      return;
    }

    const job = await cronJobsRepo.findJobById(id);
    if (!job) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    const updated = await cronJobsRepo.disableJob(id);
    logger.info({ jobId: id }, "Cron job disabled via API");
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

cronRoutes.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid cron job id" });
      return;
    }

    const job = await cronJobsRepo.findJobById(id);
    if (!job) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    await cronJobsRepo.deleteJob(id);
    logger.info({ jobId: id }, "Cron job deleted via API");
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

cronRoutes.get("/:id/history", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid cron job id" });
      return;
    }

    const job = await cronJobsRepo.findJobById(id);
    if (!job) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const history = await cronJobsRepo.listJobRunsByCronJob(id, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
});
