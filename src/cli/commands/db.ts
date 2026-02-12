import type { Command } from "commander";

export const commands = (program: Command) => {
  const dbCmd = program.command("db");

  dbCmd
    .command("migrate")
    .description("Run database migrations")
    .action(async () => {
      await import("../../db/migrate");
    });
};
