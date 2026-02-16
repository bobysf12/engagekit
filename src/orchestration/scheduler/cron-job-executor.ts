import { CronExpressionParser } from "cron-parser";
import type { CronJob } from "../../db/schema";
import { cronJobsRepo } from "../../db/repositories/cron-jobs.repo";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { scrapeCoordinator } from "../scrape-coordinator";
import { engagementPipelineCoordinator } from "../engagement-pipeline-coordinator";
import {
  parsePipelineConfig,
  getSourcesFromConfig,
  type CronPipelineConfig,
} from "../../domain/cron-config";
import { logger } from "../../core/logger";

export interface ExecuteResult {
  success: boolean;
  scrapeRunId?: number;
  error?: string;
}

export class CronJobExecutor {
  private accountLocks = new Set<number>();

  private acquireAccountLock(accountId: number): boolean {
    if (this.accountLocks.has(accountId)) return false;
    this.accountLocks.add(accountId);
    return true;
  }

  private releaseAccountLock(accountId: number): void {
    this.accountLocks.delete(accountId);
  }

  async executeJob(cronJob: CronJob): Promise<ExecuteResult> {
    const logCtx = { cronJobId: cronJob.id, accountId: cronJob.accountId };
    logger.info(logCtx, "Starting cron job execution");

    const account = await accountsRepo.findById(cronJob.accountId);
    if (!account) {
      const error = "Account not found";
      await cronJobsRepo.markJobFailed(cronJob.id, error);
      return { success: false, error };
    }

    if (!this.acquireAccountLock(account.id)) {
      const error = `Account ${account.id} already has an active cron execution`;
      logger.warn({ ...logCtx, error }, "Skipping cron execution due to account lock");
      return { success: false, error };
    }

    try {
      const config = parsePipelineConfig(cronJob.pipelineConfigJson);
      if (!config) {
        const error = "Invalid pipeline config";
        await cronJobsRepo.markJobFailed(cronJob.id, error);
        return { success: false, error };
      }

      const nextRunAt = this.calculateNextRun(cronJob.cronExpr, cronJob.timezone);
      const jobRun = await cronJobsRepo.createJobRun({
        cronJobId: cronJob.id,
        status: "running",
        startedAt: Math.floor(Date.now() / 1000),
      });

      await cronJobsRepo.markJobRun(cronJob.id, jobRun.id, nextRunAt);

      try {
        const { collectHome, profileHandles, searchQueries } = getSourcesFromConfig(config);

        const scrapeResult = await scrapeCoordinator.run({
          platform: account.platform as any,
          trigger: "daily",
          accountIds: [account.id],
          collectHome,
          collectProfiles: profileHandles.length > 0,
          profileHandles,
          searchQueries,
        });

        if (!scrapeResult || scrapeResult.accountsSucceeded === 0) {
          const error = scrapeResult?.errors?.[0]?.error || "Scrape failed";
          await cronJobsRepo.markJobRunFailed(jobRun.id, error);
          await cronJobsRepo.markJobFailed(cronJob.id, error);
          return { success: false, scrapeRunId: scrapeResult?.runId, error };
        }

        const runAccounts = await this.getRunAccountForScrape(scrapeResult.runId, account.id);
        if (runAccounts.length > 0) {
          for (const runAccount of runAccounts) {
            await engagementPipelineCoordinator.run({
              runAccountId: runAccount.id,
              accountId: account.id,
              generateDrafts: config.generateDrafts,
            });
          }
        }

        await cronJobsRepo.markJobRunSuccess(jobRun.id);
        await cronJobsRepo.markJobSuccess(cronJob.id);

        logger.info({ ...logCtx, scrapeRunId: scrapeResult.runId }, "Cron job completed successfully");
        return { success: true, scrapeRunId: scrapeResult.runId };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({ ...logCtx, error: errorMessage }, "Cron job execution failed");
        await cronJobsRepo.markJobRunFailed(jobRun.id, errorMessage);
        await cronJobsRepo.markJobFailed(cronJob.id, errorMessage);
        return { success: false, error: errorMessage };
      }
    } finally {
      this.releaseAccountLock(account.id);
    }
  }

  async executeManual(cronJobId: number): Promise<ExecuteResult> {
    const cronJob = await cronJobsRepo.findJobById(cronJobId);
    if (!cronJob) {
      return { success: false, error: "Cron job not found" };
    }

    const hasActive = await cronJobsRepo.hasActiveRun(cronJobId);
    if (hasActive) {
      return { success: false, error: "Job already has an active run" };
    }

    return this.executeJob(cronJob);
  }

  private calculateNextRun(cronExpr: string, timezone: string): number {
    const interval = CronExpressionParser.parse(cronExpr, {
      currentDate: new Date(),
      tz: timezone,
    });
    return Math.floor(interval.next().getTime() / 1000);
  }

  private async getRunAccountForScrape(runId: number, accountId: number) {
    const { runsRepo } = await import("../../db/repositories/runs.repo");
    const runAccounts = await runsRepo.findByRunId(runId);
    return runAccounts.filter((ra) => ra.accountId === accountId);
  }
}

export const cronJobExecutor = new CronJobExecutor();
