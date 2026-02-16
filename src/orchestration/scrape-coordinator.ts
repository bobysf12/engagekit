import type { Platform } from "../domain/models";
import { accountsRepo } from "../db/repositories/accounts.repo";
import { runsRepo } from "../db/repositories/runs.repo";
import { accountsRepo as accounts } from "../db/repositories/accounts.repo";
import { ThreadsAdapter } from "../platforms/threads";
import { XAdapter } from "../platforms/x";
import { AccountScrapeRunner } from "./account-scrape-runner";
import { logger } from "../core/logger";
import { env } from "../core/config";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(timeoutError), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export interface ScrapeCoordinatorOptions {
  platform: Platform;
  trigger: "daily" | "manual";
  accountIds?: number[];
  collectHome?: boolean;
  collectProfiles?: boolean;
  profileHandles?: string[];
  searchQueries?: string[];
}

export interface ScrapeCoordinatorResult {
  runId: number;
  status: string;
  accountsProcessed: number;
  accountsSucceeded: number;
  accountsFailed: number;
  accountsSkipped: number;
  totalPostsFound: number;
  totalCommentsFound: number;
  totalSnapshotsWritten: number;
  errors: Array<{ accountId: number; error: string }>;
}

export class ScrapeCoordinator {
  async run(options: ScrapeCoordinatorOptions): Promise<ScrapeCoordinatorResult> {
    logger.info({ options }, "Starting scrape coordinator run");

    try {
      const recovered = await runsRepo.recoverStaleRunningRuns(env.RUN_LOCK_TIMEOUT_SECONDS);
      if (recovered.runAccountsRecovered > 0 || recovered.runsRecovered > 0) {
        logger.warn({ recovered, timeoutSeconds: env.RUN_LOCK_TIMEOUT_SECONDS }, "Recovered stale running scrape records");
      }
    } catch (error) {
      logger.error({ error }, "Failed to recover stale running scrape records");
    }

    const run = await runsRepo.createRun({
      trigger: options.trigger,
      startedAt: Math.floor(Date.now() / 1000),
      status: "running",
    });

    const result: ScrapeCoordinatorResult = {
      runId: run.id,
      status: "success",
      accountsProcessed: 0,
      accountsSucceeded: 0,
      accountsFailed: 0,
      accountsSkipped: 0,
      totalPostsFound: 0,
      totalCommentsFound: 0,
      totalSnapshotsWritten: 0,
      errors: [],
    };

    try {
      const targetAccounts = options.accountIds
        ? await Promise.all(options.accountIds.map((id) => accountsRepo.findById(id))).then((a) => a.filter(Boolean))
        : await accountsRepo.listByPlatform(options.platform);

      const activeAccounts = targetAccounts.filter((acc) => acc!.status === "active") as any[];

      if (activeAccounts.length === 0) {
        logger.warn({ platform: options.platform }, "No active accounts found for scraping");
        result.status = "partial";
      }

      const adapter = this.getAdapter(options.platform);

      for (const account of activeAccounts) {
        result.accountsProcessed++;

        const runAccount = await runsRepo.createRunAccount({
          runId: run.id,
          accountId: account.id,
          status: "running",
          startedAt: Math.floor(Date.now() / 1000),
          postsFound: 0,
          commentsFound: 0,
          snapshotsWritten: 0,
        });

        try {
          const runner = new AccountScrapeRunner(account, adapter, runAccount.id);
          const scrapeTimeoutMs = env.SCRAPER_ACCOUNT_TIMEOUT_SECONDS * 1000;
          const timeoutError = new Error(`Account scrape timed out after ${env.SCRAPER_ACCOUNT_TIMEOUT_SECONDS}s`);
          (timeoutError as any).code = "ACCOUNT_SCRAPE_TIMEOUT";

          const scrapeResult = await withTimeout(
            runner.run({
              collectHome: options.collectHome ?? true,
              collectProfiles: options.collectProfiles ?? true,
              profileHandles: options.profileHandles ?? [],
              searchQueries: options.searchQueries ?? [],
            }),
            scrapeTimeoutMs,
            timeoutError
          );

          if (scrapeResult.error) {
            if (scrapeResult.error.code === "SESSION_INVALID" || scrapeResult.error.code === "SESSION_EXPIRED") {
              await accounts.setNeedsReauth(account.id, scrapeResult.error.code, scrapeResult.error.message);
              await runsRepo.markRunAccountSkippedNeedsReauth(runAccount.id);
              result.accountsSkipped++;
            } else {
              await runsRepo.markRunAccountFailed(runAccount.id, scrapeResult.error.code, scrapeResult.error.message);
              result.accountsFailed++;
              result.errors.push({ accountId: account.id, error: scrapeResult.error.message });
            }
          } else {
            await runsRepo.markRunAccountSuccess(runAccount.id, {
              postsFound: scrapeResult.postsFound,
              commentsFound: scrapeResult.commentsFound,
              snapshotsWritten: scrapeResult.snapshotsWritten,
            });
            result.accountsSucceeded++;
            result.totalPostsFound += scrapeResult.postsFound;
            result.totalCommentsFound += scrapeResult.commentsFound;
            result.totalSnapshotsWritten += scrapeResult.snapshotsWritten;
          }
        } catch (error: any) {
          const errorCode = error?.code || "UNEXPECTED_ERROR";
          const errorMessage = error?.message || "Unknown error during account scrape";
          logger.error({ accountId: account.id, errorCode, errorMessage }, "Unexpected error during account scrape");
          await runsRepo.markRunAccountFailed(runAccount.id, errorCode, errorMessage);
          result.accountsFailed++;
          result.errors.push({ accountId: account.id, error: errorMessage });
        }
      }

      result.status =
        result.accountsFailed > 0
          ? "partial"
          : result.accountsProcessed === 0
          ? "partial"
          : "success";

      await runsRepo.updateRun(run.id, {
        status: result.status as any,
        endedAt: Math.floor(Date.now() / 1000),
        notes: JSON.stringify({
          accountsProcessed: result.accountsProcessed,
          accountsSucceeded: result.accountsSucceeded,
          accountsFailed: result.accountsFailed,
          accountsSkipped: result.accountsSkipped,
          totalPostsFound: result.totalPostsFound,
          totalCommentsFound: result.totalCommentsFound,
          totalSnapshotsWritten: result.totalSnapshotsWritten,
        }),
      });

      logger.info({ runId: run.id, result }, "Scrape coordinator run completed");

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown scrape coordinator failure";
      logger.error({ runId: run.id, error: errorMessage }, "Scrape coordinator run failed");

      await runsRepo.updateRun(run.id, {
        status: "failed",
        endedAt: Math.floor(Date.now() / 1000),
        notes: JSON.stringify({ error: errorMessage }),
      });

      result.status = "failed";
      return result;
    }
  }

  private getAdapter(platform: Platform): any {
    switch (platform) {
      case "threads":
        return new ThreadsAdapter();
      case "x":
        return new XAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

export const scrapeCoordinator = new ScrapeCoordinator();
