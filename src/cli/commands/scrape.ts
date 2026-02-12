import type { Command } from "commander";
import { scrapeCoordinator } from "../../orchestration/scrape-coordinator";
import { logger } from "../../core/logger";

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
    .action(async (options) => {
      logger.info("Starting daily scrape");

      const collectHome = (options.home ?? true) && (options.notifications ?? true);
      const collectProfiles = (options.profiles ?? true) && (options.ownThreads ?? true);

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
    .action(async (options) => {
      const accountId = parseInt(options.account, 10);

      const collectHome = (options.home ?? true) && (options.notifications ?? true);
      const collectProfiles = (options.profiles ?? true) && (options.ownThreads ?? true);

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

      process.exit(result.status === "failed" ? 1 : 0);
    });
};
