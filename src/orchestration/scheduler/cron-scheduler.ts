import { CronExpressionParser } from "cron-parser";
import { cronJobsRepo } from "../../db/repositories/cron-jobs.repo";
import { cronJobExecutor } from "./cron-job-executor";
import { logger } from "../../core/logger";
import { env } from "../../core/config";

const TICK_INTERVAL_MS = 60 * 1000;

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
    this.tick();
    this.interval = setInterval(() => this.tick(), TICK_INTERVAL_MS);
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
      logger.debug("Scheduler tick already in progress, skipping");
      return;
    }

    this.isRunning = true;
    try {
      const now = Math.floor(Date.now() / 1000);
      const dueJobs = await cronJobsRepo.listDueJobs(now);

      if (dueJobs.length === 0) {
        logger.debug("No due jobs found");
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
