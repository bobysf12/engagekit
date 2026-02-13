import type { Command } from "commander";
import { cronJobsRepo } from "../../db/repositories/cron-jobs.repo";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { logger } from "../../core/logger";

export const commands = (program: Command) => {
  program
    .command("cron:create")
    .requiredOption("--account <id>", "Account ID")
    .requiredOption("--name <name>", "Job name")
    .requiredOption("--schedule <cron>", "Cron expression (e.g., '0 9 * * *' for daily at 9am)")
    .option("--timezone <tz>", "Timezone", "UTC")
    .option("--config <json>", "Pipeline config JSON")
    .action(async (options) => {
      const accountId = parseInt(options.account, 10);

      const account = await accountsRepo.findById(accountId);
      if (!account) {
        console.log(`Account ${accountId} not found`);
        process.exit(1);
      }

      const job = await cronJobsRepo.createJob({
        accountId,
        name: options.name,
        cronExpr: options.schedule,
        timezone: options.timezone,
        enabled: 1,
        pipelineConfigJson: options.config || null,
        lastRunAt: null,
        nextRunAt: null,
        lastStatus: null,
        lastError: null,
      });

      logger.info({ jobId: job.id, accountId }, "Cron job created");
      console.log(`Cron job [${job.id}] created: "${job.name}" for account ${accountId}`);
      console.log(`  Schedule: ${job.cronExpr} (${job.timezone})`);
    });

  program
    .command("cron:list")
    .option("--account <id>", "Filter by Account ID")
    .option("--enabled", "Show only enabled jobs")
    .action(async (options) => {
      let jobs;
      if (options.account) {
        jobs = await cronJobsRepo.listJobsByAccount(parseInt(options.account, 10));
      } else if (options.enabled) {
        jobs = await cronJobsRepo.listEnabledJobs();
      } else {
        const enabledJobs = await cronJobsRepo.listEnabledJobs();
        const accountId = enabledJobs[0]?.accountId;
        if (accountId) {
          jobs = await cronJobsRepo.listJobsByAccount(accountId);
        } else {
          jobs = enabledJobs;
        }
      }

      console.log(`Cron jobs (${jobs.length})`);
      console.log("");

      for (const job of jobs) {
        const enabledIcon = job.enabled ? "✓" : "✗";
        const statusStr = job.lastStatus || "never";
        const nextRun = job.nextRunAt ? new Date(job.nextRunAt * 1000).toISOString() : "not scheduled";

        console.log(
          `${enabledIcon} [${job.id}] "${job.name}" account=${job.accountId}`
        );
        console.log(`      Schedule: ${job.cronExpr} (${job.timezone})`);
        console.log(`      Last: ${statusStr} | Next: ${nextRun}`);
        if (job.lastError) {
          console.log(`      Error: ${job.lastError}`);
        }
      }
    });

  program
    .command("cron:enable")
    .requiredOption("--id <id>", "Job ID")
    .action(async (options) => {
      const id = parseInt(options.id, 10);
      const job = await cronJobsRepo.enableJob(id);
      if (!job) {
        console.log(`Job ${id} not found`);
        process.exit(1);
      }
      logger.info({ jobId: id }, "Cron job enabled");
      console.log(`Job ${id} "${job.name}" enabled`);
    });

  program
    .command("cron:disable")
    .requiredOption("--id <id>", "Job ID")
    .action(async (options) => {
      const id = parseInt(options.id, 10);
      const job = await cronJobsRepo.disableJob(id);
      if (!job) {
        console.log(`Job ${id} not found`);
        process.exit(1);
      }
      logger.info({ jobId: id }, "Cron job disabled");
      console.log(`Job ${id} "${job.name}" disabled`);
    });

  program
    .command("cron:update")
    .requiredOption("--id <id>", "Job ID")
    .option("--name <name>", "New job name")
    .option("--schedule <cron>", "New cron expression")
    .option("--timezone <tz>", "New timezone")
    .option("--config <json>", "New pipeline config JSON")
    .action(async (options) => {
      const id = parseInt(options.id, 10);

      const updates: Record<string, unknown> = {};
      if (options.name) updates.name = options.name;
      if (options.schedule) updates.cronExpr = options.schedule;
      if (options.timezone) updates.timezone = options.timezone;
      if (options.config !== undefined) updates.pipelineConfigJson = options.config || null;

      if (Object.keys(updates).length === 0) {
        console.log("No updates provided");
        return;
      }

      const job = await cronJobsRepo.updateJob(id, updates);
      if (!job) {
        console.log(`Job ${id} not found`);
        process.exit(1);
      }

      logger.info({ jobId: id, updates }, "Cron job updated");
      console.log(`Job ${id} "${job.name}" updated`);
    });

  program
    .command("cron:delete")
    .requiredOption("--id <id>", "Job ID")
    .action(async (options) => {
      const id = parseInt(options.id, 10);
      const job = await cronJobsRepo.findJobById(id);

      if (!job) {
        console.log(`Job ${id} not found`);
        process.exit(1);
      }

      await cronJobsRepo.deleteJob(id);
      console.log(`Job ${id} "${job.name}" deleted`);
    });

  program
    .command("cron:history")
    .requiredOption("--id <id>", "Job ID")
    .option("--limit <n>", "Number of runs to show", "20")
    .action(async (options) => {
      const id = parseInt(options.id, 10);
      const limit = parseInt(options.limit, 10);

      const job = await cronJobsRepo.findJobById(id);
      if (!job) {
        console.log(`Job ${id} not found`);
        process.exit(1);
      }

      const runs = await cronJobsRepo.listJobRunsByCronJob(id, limit);

      console.log(`Run history for job ${id} "${job.name}" (${runs.length} runs)`);
      console.log("");

      for (const run of runs) {
        const statusIcon = run.status === "success" ? "✓" : run.status === "failed" ? "✗" : "○";
        const started = new Date(run.startedAt * 1000).toISOString();
        const ended = run.endedAt ? new Date(run.endedAt * 1000).toISOString() : "running";
        const duration = run.endedAt ? `${run.endedAt - run.startedAt}s` : "-";

        console.log(`${statusIcon} [${run.id}] ${run.status} | ${started} -> ${ended} (${duration})`);
        if (run.error) {
          console.log(`    Error: ${run.error}`);
        }
      }
    });
};
