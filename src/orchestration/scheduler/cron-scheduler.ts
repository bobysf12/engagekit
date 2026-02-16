import { CronExpressionParser } from "cron-parser";
import { cronJobsRepo } from "../../db/repositories/cron-jobs.repo";
import { cronJobExecutor } from "./cron-job-executor";
import { logger } from "../../core/logger";
import { env } from "../../core/config";

const TICK_INTERVAL_MS = 60 * 1000;
const STALE_RUN_TIMEOUT_SECONDS = 60 * 60; // 1 hour

function calculateNextRun(cronExpr: string, timezone: string): number {
  const interval = CronExpressionParser.parse(cronExpr, {
    currentDate: new Date(),
    tz: timezone,
  });
  return Math.floor(interval.next().getTime() / 1000);
}

class CronScheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  start() {
    if (!env.SCHEDULER_ENABLED) {
      logger.info("SCHEDULER_ENABLED is false, scheduler not starting");
      return;
    }

    if (this.interval) {
      logger.warn("Scheduler already running");
      return;
    }

    logger.info("Starting cron scheduler");
    this.recoverStaleJobs();
    this.fixMissingNextRunAt();
    this.tick();
    this.interval = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  private async recoverStaleJobs() {
    try {
      const recoveredRuns = await cronJobsRepo.recoverStaleRuns(STALE_RUN_TIMEOUT_SECONDS);
      if (recoveredRuns > 0) {
        logger.info({ count: recoveredRuns }, "Recovered stale job runs");
      }

      const jobs = await cronJobsRepo.listJobsStuckRunning(STALE_RUN_TIMEOUT_SECONDS);
      for (const job of jobs) {
        const nextRunAt = calculateNextRun(job.cronExpr, job.timezone);
        await cronJobsRepo.markJobFailed(job.id, "Job timed out - recovered on scheduler restart");
        await cronJobsRepo.updateJob(job.id, { nextRunAt });
        logger.warn({ jobId: job.id }, "Recovered stale job marked as running");
      }
      if (jobs.length > 0) {
        logger.info({ count: jobs.length }, "Recovered stale jobs");
      }
    } catch (error) {
      logger.error({ error }, "Failed to recover stale jobs");
    }
  }

  private async fixMissingNextRunAt() {
    try {
      const jobs = await cronJobsRepo.listEnabledJobs();
      for (const job of jobs) {
        if (job.nextRunAt === null) {
          const nextRunAt = calculateNextRun(job.cronExpr, job.timezone);
          await cronJobsRepo.updateJob(job.id, { nextRunAt });
          logger.info({ jobId: job.id, nextRunAt }, "Fixed missing nextRunAt for job");
        }
      }
    } catch (error) {
      logger.error({ error }, "Failed to fix missing nextRunAt");
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("Cron scheduler stopped");
    }
  }

  private async tick() {
    if (this.isRunning) {
      logger.info("Scheduler tick already in progress, skipping");
      return;
    }

    this.isRunning = true;
    logger.info("Scheduler tick starting");
    try {
      await this.recoverStaleJobs();

      const now = Math.floor(Date.now() / 1000);
      const dueJobs = await cronJobsRepo.listDueJobs(now);

      if (dueJobs.length === 0) {
        const allJobs = await cronJobsRepo.listEnabledJobs();
        if (allJobs.length > 0) {
          logger.info(
            { jobs: allJobs.map(j => ({ id: j.id, nextRunAt: j.nextRunAt, now })) },
            "No due jobs - enabled jobs status"
          );
        } else {
          logger.info("No enabled cron jobs found");
        }
        return;
      }

      logger.info({ count: dueJobs.length }, "Processing due cron jobs");

      for (const job of dueJobs) {
        const hasActive = await cronJobsRepo.hasActiveRun(job.id);
        if (hasActive) {
          logger.info({ cronJobId: job.id }, "Skipping job - already has active run");
          continue;
        }

        logger.info({ cronJobId: job.id, name: job.name }, "Executing due cron job");
        
        try {
          await cronJobExecutor.executeJob(job);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error({ cronJobId: job.id, error: errorMessage }, "Job execution failed");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage }, "Scheduler tick failed");
    } finally {
      this.isRunning = false;
    }
  }
}

export const cronScheduler = new CronScheduler();
