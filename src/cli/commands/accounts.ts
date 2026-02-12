import type { Command } from "commander";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { logger } from "../../core/logger";
import { validateTransition } from "../../domain/account-state-machine";

export const commands = (program: Command) => {
  const accountsCmd = program.command("accounts");

  accountsCmd
    .command("add")
    .requiredOption("--platform <platform>", "Platform (threads or x)")
    .requiredOption("--handle <handle>", "Account handle (without @)")
    .option("--name <name>", "Display name")
    .action(async (options) => {
      const account = await accountsRepo.create({
        platform: options.platform,
        handle: options.handle,
        displayName: options.name || options.handle,
        status: "needs_initial_auth",
        sessionStatePath: `./data/sessions/${options.platform}-account-<id>.json`,
        cooldownSeconds: 30,
      });

      await accountsRepo.update(account.id, {
        sessionStatePath: `./data/sessions/${options.platform}-account-${account.id}.json`,
      });

      logger.info(
        { accountId: account.id, handle: options.handle, platform: options.platform },
        "Account created. Run 'auth:login' to set up authentication."
      );
    });

  accountsCmd
    .command("list")
    .option("--platform <platform>", "Filter by platform")
    .action(async (options) => {
      const list = options.platform
        ? await accountsRepo.listByPlatform(options.platform)
        : await accountsRepo.findByStatus("active");

      logger.info({ count: list.length }, "Accounts");
      for (const account of list) {
        console.log(`  [${account.id}] ${account.platform}/${account.handle} (${account.status})`);
      }
    });

  accountsCmd
    .command("update-status")
    .requiredOption("--id <id>", "Account ID")
    .requiredOption("--status <status>", "New status (active, needs_reauth, disabled)")
    .action(async (options) => {
      const id = parseInt(options.id, 10);
      const account = await accountsRepo.findById(id);

      if (!account) {
        logger.error({ id }, "Account not found");
        process.exit(1);
      }

      validateTransition(account.status, options.status as any);

      await accountsRepo.updateStatus(id, options.status as any);
      logger.info({ id, from: account.status, to: options.status }, "Account status updated");
    });
};
