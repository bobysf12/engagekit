import { Router } from "express";
import { runsRepo } from "../../db/repositories/runs.repo";
import { deleteService } from "../../services/delete.service";
import { logger } from "../../core/logger";
import { getDb } from "../../db/client";
import { scrapeRunAccounts, accounts } from "../../db/schema";
import { eq } from "drizzle-orm";

export const runsRoutes = Router();

runsRoutes.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const runs = await runsRepo.listRecent(limit);
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

runsRoutes.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid run id" });
      return;
    }

    const run = await runsRepo.findById(id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const db = getDb();
    const runAccounts = await db
      .select({
        id: scrapeRunAccounts.id,
        runId: scrapeRunAccounts.runId,
        accountId: scrapeRunAccounts.accountId,
        status: scrapeRunAccounts.status,
        postsFound: scrapeRunAccounts.postsFound,
        commentsFound: scrapeRunAccounts.commentsFound,
        snapshotsWritten: scrapeRunAccounts.snapshotsWritten,
        errorCode: scrapeRunAccounts.errorCode,
        errorDetail: scrapeRunAccounts.errorDetail,
        startedAt: scrapeRunAccounts.startedAt,
        endedAt: scrapeRunAccounts.endedAt,
        accountHandle: accounts.handle,
        accountDisplayName: accounts.displayName,
        accountPlatform: accounts.platform,
      })
      .from(scrapeRunAccounts)
      .innerJoin(accounts, eq(scrapeRunAccounts.accountId, accounts.id))
      .where(eq(scrapeRunAccounts.runId, id));

    res.json({ ...run, accounts: runAccounts });
  } catch (err) {
    next(err);
  }
});

runsRoutes.delete("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid run id" });
      return;
    }

    const run = await runsRepo.findById(id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    await deleteService.deleteRun(id);
    logger.info({ runId: id }, "Run deleted via API");
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

runsRoutes.get("/:id/accounts", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid run id" });
      return;
    }

    const run = await runsRepo.findById(id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const runAccounts = await runsRepo.findByRunId(id);
    res.json(runAccounts);
  } catch (err) {
    next(err);
  }
});

runsRoutes.delete("/accounts/:runAccountId", async (req, res, next) => {
  try {
    const runAccountId = parseInt(req.params.runAccountId);
    if (isNaN(runAccountId)) {
      res.status(400).json({ error: "Invalid run account id" });
      return;
    }

    const runAccount = await runsRepo.findRunAccountById(runAccountId);
    if (!runAccount) {
      res.status(404).json({ error: "Run account not found" });
      return;
    }

    await deleteService.deleteRunAccount(runAccountId);
    logger.info({ runAccountId }, "Run account deleted via API");
    res.json({ success: true, id: runAccountId });
  } catch (err) {
    next(err);
  }
});
