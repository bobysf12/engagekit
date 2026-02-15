import { readFile } from "node:fs/promises";
import { accountsRepo } from "../db/repositories/accounts.repo";
import { logger } from "../core/logger";
import { parseStorageState } from "../services/playwright-session-state";

async function main() {
  const accountId = 1;

  logger.info({ accountId }, "Loading account");

  const account = await accountsRepo.findById(accountId);
  if (!account) {
    logger.error({ accountId }, "Account not found");
    process.exit(1);
  }

  if (!account.sessionStatePath) {
    logger.error({ accountId }, "Account has no session_state_path set");
    process.exit(1);
  }

  logger.info(
    { accountId, sessionStatePath: account.sessionStatePath },
    "Reading session state from file"
  );

  let fileContent: string;
  try {
    fileContent = await readFile(account.sessionStatePath, "utf-8");
  } catch (error) {
    logger.error(
      { accountId, sessionStatePath: account.sessionStatePath, error },
      "Failed to read session state file"
    );
    process.exit(1);
  }

  let state: ReturnType<typeof parseStorageState>;
  try {
    state = parseStorageState(fileContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    logger.error({ accountId, error: message }, "Failed to parse session state JSON");
    process.exit(1);
  }

  const cookieCount = state.cookies?.length || 0;
  const originCount = state.origins?.length || 0;

  logger.info(
    { accountId, cookieCount, originCount },
    "Parsed session state"
  );

  await accountsRepo.update(accountId, {
    sessionStateJson: fileContent,
  });

  logger.info(
    { accountId, cookieCount, originCount },
    "Session state migrated to database successfully"
  );
}

main().catch((error) => {
  logger.error(error, "Migration failed");
  process.exit(1);
});
