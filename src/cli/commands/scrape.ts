import type { Command } from "commander";
import { scrapeCoordinator } from "../../orchestration/scrape-coordinator";
import { engagementPipelineCoordinator } from "../../orchestration/engagement-pipeline-coordinator";
import { runsRepo } from "../../db/repositories/runs.repo";
import { logger } from "../../core/logger";
import { env } from "../../core/config";

export const commands = (program: Command) => {
  program
    .command("scrape:daily")
    .requiredOption("--platform <platform>", "Platform (threads or x)")
    .option("--account <ids...>", "Specific account IDs (space-separated)")
    .option("--no-home", "Skip home feed collection")
    .option("--no-profiles", "Skip profile collection")
    .option("--profile-handle <handles...>", "Additional profile handles (space-separated)")
    .option("--no-notifications", "Skip notification collection")
    .option("--no-own-threads", "Skip own thread collection")
    .option("--search <queries...>", "Search queries (space-separated)")
    .option("--no-pipeline", "Skip engagement pipeline after scrape")
    .option("--with-drafts", "Generate reply drafts (requires --pipeline and DRAFTS_ENABLED)")
    .action(async (options) => {
      logger.info("Starting daily scrape");

      const collectHome = (options.home ?? true) && (options.notifications ?? true);
      const collectProfiles = (options.profiles ?? true) && (options.ownThreads ?? true);
      const runPipeline = options.pipeline !== false;
      const generateDrafts = options.withDrafts === true;

      const result = await scrapeCoordinator.run({
        platform: options.platform,
        trigger: "daily",
        accountIds: options.account ? options.account.map(Number) : undefined,
        collectHome,
        collectProfiles,
        profileHandles: options.profileHandle || [],
        searchQueries: options.search || [],
      });

      logger.info({
        runId: result.runId,
        status: result.status,
        accountsProcessed: result.accountsProcessed,
        accountsSucceeded: result.accountsSucceeded,
        accountsFailed: result.accountsFailed,
        accountsSkipped: result.accountsSkipped,
        totalPostsFound: result.totalPostsFound,
        totalCommentsFound: result.totalCommentsFound,
        totalSnapshotsWritten: result.totalSnapshotsWritten,
      }, "Daily scrape completed");

      if (result.errors.length > 0) {
        logger.warn({ errors: result.errors }, "Errors occurred during scrape");
      }

      if (runPipeline && (env.TRIAGE_ENABLED || env.DEEP_SCRAPE_ENABLED || env.DRAFTS_ENABLED)) {
        await runPipelineForScrapeRun(result.runId, generateDrafts);
      }

      process.exit(result.status === "failed" ? 1 : 0);
    });

  program
    .command("scrape:account")
    .requiredOption("--account <id>", "Account ID")
    .option("--no-home", "Skip home feed collection")
    .option("--no-profiles", "Skip profile collection")
    .option("--profile-handle <handles...>", "Additional profile handles (space-separated)")
    .option("--no-notifications", "Skip notification collection")
    .option("--no-own-threads", "Skip own thread collection")
    .option("--search <queries...>", "Search queries (space-separated)")
    .option("--no-pipeline", "Skip engagement pipeline after scrape")
    .option("--with-drafts", "Generate reply drafts (requires --pipeline and DRAFTS_ENABLED)")
    .action(async (options) => {
      const accountId = parseInt(options.account, 10);

      const collectHome = (options.home ?? true) && (options.notifications ?? true);
      const collectProfiles = (options.profiles ?? true) && (options.ownThreads ?? true);
      const runPipeline = options.pipeline !== false;
      const generateDrafts = options.withDrafts === true;

      logger.info({ accountId }, "Starting account scrape");

      const account = await import("../../db/repositories/accounts.repo").then(m => m.accountsRepo.findById(accountId));
      if (!account) {
        logger.error({ accountId }, "Account not found");
        process.exit(1);
      }

      const result = await scrapeCoordinator.run({
        platform: account.platform as any,
        trigger: "manual",
        accountIds: [accountId],
        collectHome,
        collectProfiles,
        profileHandles: options.profileHandle || [],
        searchQueries: options.search || [],
      });

      logger.info({
        runId: result.runId,
        status: result.status,
        accountsProcessed: result.accountsProcessed,
        accountsSucceeded: result.accountsSucceeded,
        accountsFailed: result.accountsFailed,
        accountsSkipped: result.accountsSkipped,
        totalPostsFound: result.totalPostsFound,
        totalCommentsFound: result.totalCommentsFound,
        totalSnapshotsWritten: result.totalSnapshotsWritten,
      }, "Account scrape completed");

      if (result.errors.length > 0) {
        logger.warn({ errors: result.errors }, "Errors occurred during account scrape");
      }

      if (runPipeline && (env.TRIAGE_ENABLED || env.DEEP_SCRAPE_ENABLED || env.DRAFTS_ENABLED)) {
        await runPipelineForScrapeRun(result.runId, generateDrafts);
      }

      process.exit(result.status === "failed" ? 1 : 0);
    });

  program
    .command("pipeline:run")
    .requiredOption("--run-account <id>", "Run Account ID")
    .option("--with-drafts", "Generate reply drafts (requires DRAFTS_ENABLED)")
    .action(async (options) => {
      const runAccountId = parseInt(options.runAccount, 10);
      const generateDrafts = options.withDrafts === true;

      const runAccount = await runsRepo.findRunAccountById(runAccountId);
      if (!runAccount) {
        logger.error({ runAccountId }, "Run account not found");
        process.exit(1);
      }

      const result = await engagementPipelineCoordinator.run({
        runAccountId,
        accountId: runAccount.accountId,
        generateDrafts,
      });

      console.log("Pipeline completed:");
      console.log(`  Triage: ${result.triage.triagedPosts}/${result.triage.totalPosts} posts (${result.triage.failedPosts} failed)`);
      console.log(`  Selection: ${result.selection.top20Count} top20, ${result.selection.selectedForDeepScrape} for deep scrape`);
      console.log(`  Deep scrape: ${result.deepScrape.successCount}/${result.deepScrape.totalTasks} tasks, ${result.deepScrape.commentsCollected} comments`);
      console.log(`  Drafts: ${result.drafts.draftsGenerated} for ${result.drafts.totalPosts} posts`);

      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
        for (const err of result.errors.slice(0, 5)) {
          console.log(`    - [${err.stage}] ${err.postId ? `post ${err.postId}: ` : ""}${err.error}`);
        }
      }

      process.exit(result.errors.length > 0 ? 1 : 0);
    });
};

async function runPipelineForScrapeRun(runId: number, generateDrafts: boolean) {
  const runAccounts = await runsRepo.findByRunId(runId);

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

      logger.info(
        {
          runAccountId: runAccount.id,
          triaged: pipelineResult.triage.triagedPosts,
          selected: pipelineResult.selection.selectedForDeepScrape,
          drafts: pipelineResult.drafts.draftsGenerated,
        },
        "Pipeline completed for run-account"
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        { runAccountId: runAccount.id, error: errorMessage },
        "Pipeline failed for run-account"
      );
    }
  }
}
