import Database from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { env } from "../core/config";
import { logger } from "../core/logger";

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const sqlite = new Database(env.DATABASE_PATH);
    db = drizzle(sqlite);
    logger.info({ path: env.DATABASE_PATH }, "Database connected");
  }
  return db;
}

export function closeDb() {
  if (db) {
    db = null;
    logger.info("Database connection closed");
  }
}
