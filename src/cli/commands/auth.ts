import type { Command } from "commander";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { accountsRepo } from "../../db/repositories/accounts.repo";
import { logger } from "../../core/logger";
import { validateTransition } from "../../domain/account-state-machine";
import { ThreadsAdapter } from "../../platforms/threads";
import { XAdapter } from "../../platforms/x";
import { env } from "../../core/config";
import {
  serializeStorageState,
  getRequiredStorageState,
  hasSessionState,
} from "../../services/playwright-session-state";

export const commands = (program: Command) => {
  program
    .command("auth:login")
    .requiredOption("--account <id>", "Account ID")
    .action(async (options) => {
      const id = parseInt(options.account, 10);
      const account = await accountsRepo.findById(id);

      if (!account) {
        logger.error({ id }, "Account not found");
        process.exit(1);
      }

      logger.info(
        { accountId: id, handle: account.handle },
        "Starting headful login",
      );

      let browser: Browser | null = null;
      let context: BrowserContext | null = null;

      try {
        validateTransition(account.status, "active");

        browser = await chromium.launch({
          headless: false,
          slowMo: env.PLAYWRIGHT_SLOW_MO,
        });
        context = await browser.newContext();

        const adapter =
          account.platform === "threads"
            ? new ThreadsAdapter()
            : new XAdapter();
        await adapter.performLogin(await context.newPage(), account.handle);

        const state = await context.storageState();
        const sessionStateJson = serializeStorageState(state);

        await accountsRepo.update(id, {
          status: "active",
          sessionStateJson,
          lastAuthAt: Math.floor(Date.now() / 1000),
          lastAuthCheckAt: Math.floor(Date.now() / 1000),
        });

        await accountsRepo.clearAuthError(id);

        logger.info(
          { accountId: id, cookieCount: state.cookies?.length || 0 },
          "Login successful, session saved to database",
        );
      } catch (error: any) {
        logger.error(error, "Login failed");
        process.exit(1);
      } finally {
        if (context) await context.close();
        if (browser) await browser.close();
      }
    });

  program
    .command("auth:check")
    .requiredOption("--account <id>", "Account ID")
    .action(async (options) => {
      const id = parseInt(options.account, 10);
      const account = await accountsRepo.findById(id);

      if (!account) {
        logger.error({ id }, "Account not found");
        process.exit(1);
      }

      logger.info({ accountId: id }, "Checking session validity");

      let browser: Browser | null = null;
      let context: BrowserContext | null = null;

      try {
        if (!hasSessionState(account)) {
          logger.warn({ accountId: id }, "No session state in database");
          await accountsRepo.setNeedsReauth(id, "SESSION_STATE_MISSING", "No session state in database");
          return;
        }

        const storageState = getRequiredStorageState(account);

        browser = await chromium.launch({
          headless: true,
          slowMo: env.PLAYWRIGHT_SLOW_MO,
        });
        context = await browser.newContext({
          storageState: storageState as any,
        });

        const adapter =
          account.platform === "threads"
            ? new ThreadsAdapter()
            : new XAdapter();
        const authState = await adapter.validateSession(
          await context.newPage(),
        );

        await accountsRepo.update(id, {
          lastAuthCheckAt: Math.floor(Date.now() / 1000),
        });

        if (authState.isValid) {
          await accountsRepo.update(id, { status: "active" });
          await accountsRepo.clearAuthError(id);
          logger.info({ accountId: id }, "Session is valid");
        } else {
          logger.warn(
            { accountId: id, error: authState.error },
            "Session is invalid",
          );
          await accountsRepo.setNeedsReauth(
            id,
            "SESSION_INVALID",
            authState.error || "Unknown error",
          );
        }
      } catch (error: any) {
        logger.error({ accountId: id, error }, "Session check failed");
        await accountsRepo.setNeedsReauth(id, "CHECK_FAILED", error.message);
      } finally {
        if (context) await context.close();
        if (browser) await browser.close();
      }
    });
};
