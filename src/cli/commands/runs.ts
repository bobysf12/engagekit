import type { Command } from "commander";
import { runsRepo } from "../../db/repositories/runs.repo";
import { logger } from "../../core/logger";

export const commands = (program: Command) => {
  const runsCmd = program.command("runs");

  runsCmd
    .command("list")
    .option("--limit <n>", "Number of runs to show", "20")
    .action(async (options) => {
      const limit = parseInt(options.limit, 10);
      const runs = await runsRepo.listRecent(limit);

      logger.info({ count: runs.length }, "Recent scrape runs");

      for (const run of runs) {
        console.log(`  [${run.id}] ${run.trigger} - ${run.status} - ${new Date(run.startedAt * 1000).toISOString()}`);

        const runAccounts = await runsRepo.findByRunId(run.id);
        for (const ra of runAccounts) {
          const statusIcon = ra.status === "success" ? "✓" : ra.status === "skipped_needs_reauth" ? "⊘" : ra.status === "failed" ? "✗" : "○";
          console.log(`    ${statusIcon} Account ${ra.accountId}: ${ra.status} (${ra.postsFound} posts, ${ra.commentsFound} comments)`);
        }
      }
    });
};
