import type { Command } from "commander";
import { queueRepo } from "../../db/repositories/queue.repo";
import { logger } from "../../core/logger";

export const commands = (program: Command) => {
  const queueCmd = program.command("queue");

  queueCmd
    .command("list")
    .option("--status <status>", "Filter by status")
    .option("--limit <n>", "Number of items to show", "50")
    .action(async (options) => {
      const limit = parseInt(options.limit, 10);
      const items = options.status
        ? await queueRepo.listByStatus(options.status, limit)
        : await queueRepo.listByStatus("pending", limit);

      logger.info({ count: items.length }, "Engagement queue items");

      for (const item of items) {
        console.log(`  [${item.id}] ${item.entityType} #${item.entityId} - ${item.reason} (priority: ${item.priority})`);
      }
    });
};
