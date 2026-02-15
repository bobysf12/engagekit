import { Router } from "express";
import { runsRepo } from "../../db/repositories/runs.repo";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { deleteService } from "../../services/delete.service";
import { scrapeCoordinator } from "../../orchestration/scrape-coordinator";
import { engagementPipelineCoordinator } from "../../orchestration/engagement-pipeline-coordinator";
import { logger } from "../../core/logger";
import { env } from "../../core/config";
import { getDb } from "../../db/client";
import { scrapeRunAccounts, accounts } from "../../db/schema";
import { eq } from "drizzle-orm";

export const runsRoutes = Router();

// IMPORTANT: Static/specific routes must be defined BEFORE dynamic routes like /:id
// to prevent Express from matching the dynamic route first.

runsRoutes.post("/trigger", async (req, res, next) => {
  try {
    const accountId = parseInt(req.body.accountId, 10);
    if (isNaN(accountId)) {
      res.status(400).json({ error: "accountId is required and must be a number" });
      return;
    }

    const account = await accountsRepo.findById(accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const collectHome = req.body.collectHome !== false;
    const collectProfiles = req.body.collectProfiles !== false;
    const profileHandles: string[] = req.body.profileHandles || [];
    const searchQueries: string[] = req.body.searchQueries || [];
    const runPipeline = req.body.runPipeline !== false;
    const generateDrafts = req.body.generateDrafts === true;

    const scrapeResult = await scrapeCoordinator.run({
      platform: account.platform as "threads" | "x",
      trigger: "manual",
      accountIds: [accountId],
      collectHome,
      collectProfiles,
      profileHandles,
      searchQueries,
    });

    const pipelineResults: Array<{
      runAccountId: number;
      triaged: number;
      selected: number;
      draftsGenerated: number;
      errors: number;
    }> = [];

    if (runPipeline && (env.TRIAGE_ENABLED || env.DEEP_SCRAPE_ENABLED || env.DRAFTS_ENABLED)) {
      const runAccounts = await runsRepo.findByRunId(scrapeResult.runId);

      for (const runAccount of runAccounts) {
        if (runAccount.status !== "success") {
          continue;
        }

        try {
          const pipelineResult = await engagementPipelineCoordinator.run({
            runAccountId: runAccount.id,
            accountId: runAccount.accountId,
            generateDrafts,
          });

          pipelineResults.push({
            runAccountId: runAccount.id,
            triaged: pipelineResult.triage.triagedPosts,
            selected: pipelineResult.selection.selectedForDeepScrape,
            draftsGenerated: pipelineResult.drafts.draftsGenerated,
            errors: pipelineResult.errors.length,
          });

          logger.info(
            {
              runAccountId: runAccount.id,
              triaged: pipelineResult.triage.triagedPosts,
              selected: pipelineResult.selection.selectedForDeepScrape,
              drafts: pipelineResult.drafts.draftsGenerated,
            },
            "Pipeline completed for run-account via API trigger"
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(
            { runAccountId: runAccount.id, error: errorMessage },
            "Pipeline failed for run-account via API trigger"
          );
          pipelineResults.push({
            runAccountId: runAccount.id,
            triaged: 0,
            selected: 0,
            draftsGenerated: 0,
            errors: 1,
          });
        }
      }
    }

    logger.info({ runId: scrapeResult.runId, accountId }, "Run triggered via API");

    res.json({
      runId: scrapeResult.runId,
      status: scrapeResult.status,
      scrape: {
        accountsProcessed: scrapeResult.accountsProcessed,
        accountsSucceeded: scrapeResult.accountsSucceeded,
        accountsFailed: scrapeResult.accountsFailed,
        postsFound: scrapeResult.totalPostsFound,
        commentsFound: scrapeResult.totalCommentsFound,
      },
      pipeline: pipelineResults,
    });
  } catch (err) {
    next(err);
  }
});

runsRoutes.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const runs = await runsRepo.listRecent(limit);
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

// Nested routes like /:id/accounts MUST come BEFORE /:id
// Otherwise /123/accounts matches /:id with id="123/accounts"

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

// Dynamic routes /:id must be defined LAST
// This specific route pattern won't conflict with /accounts/:runAccountId below

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

// This route has a different base path (/accounts) so it won't conflict with /:id
// It's safe to place it here

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
