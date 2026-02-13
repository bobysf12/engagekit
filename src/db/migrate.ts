import Database from "bun:sqlite";
import { logger } from "../core/logger";
import { env } from "../core/config";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

async function runMigrations(db: Database) {
  logger.info("Running database migrations...");

  const migrationsDir = join(import.meta.dir, "migrations");

  if (!existsSync(migrationsDir)) {
    logger.info("No migrations directory found");
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  const appliedMigrations = new Set<string>();
  const appliedRows = db.query<{ hash: string }, []>("SELECT hash FROM __drizzle_migrations").all();
  for (const row of appliedRows) {
    appliedMigrations.add(row.hash);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedMigrations.has(file)) {
      logger.debug({ file }, "Migration already applied, skipping");
      continue;
    }

    const filePath = join(migrationsDir, file);
    const content = readFileSync(filePath, "utf-8");

    logger.info({ file }, "Applying migration...");

    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        logger.debug({ statement: statement.substring(0, 200) }, "Executing statement");
        db.run(statement);
      } catch (error: any) {
        if (
          error.message?.includes("already exists") ||
          error.message?.includes("duplicate column") ||
          error.message?.includes("UNIQUE constraint")
        ) {
          logger.debug({ statement: statement.substring(0, 100) }, "Object already exists, continuing");
        } else {
          logger.error({ error, statement: statement.substring(0, 200) }, "Statement failed");
          throw error;
        }
      }
    }

    try {
      db.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [file, Date.now()]);
      logger.info({ file }, "Migration applied successfully");
    } catch (error: any) {
      logger.error({ error, file }, "Migration failed");
      throw error;
    }
  }

  logger.info("All migrations completed");
}

async function main() {
  const db = new Database(env.DATABASE_PATH);

  try {
    await runMigrations(db);
    logger.info("Database schema pushed successfully");
  } catch (error: any) {
    logger.error({ error }, "Database push failed");
    process.exit(1);
  } finally {
    db.close();
  }

  process.exit(0);
}

main();
