import { $ } from "bun";
import { logger } from "../core/logger";

async function main() {
  logger.info("Pushing database schema...");

  try {
    await $`bunx drizzle-kit push`.quiet();
    logger.info("Database schema pushed successfully");
  } catch (error: any) {
    logger.error({ error }, "Database push failed");
    process.exit(1);
  }

  process.exit(0);
}

main();
