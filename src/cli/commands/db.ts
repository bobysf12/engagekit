import type { Command } from "commander";

export const commands = (program: Command) => {
  program
    .command("db:migrate")
    .description("Run database migrations")
    .action(async () => {
      await import("../../db/migrate");
    });
};
