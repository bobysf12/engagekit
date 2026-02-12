import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
  DATABASE_PATH: z.string().default("./data/app.db"),
  PLAYWRIGHT_HEADLESS: z.string().default("true").transform((v) => v === "true"),
  PLAYWRIGHT_SLOW_MO: z.coerce.number().default(0),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_PRETTY: z.string().default("true").transform((v) => v === "true"),
  SCRAPER_DEFAULT_COOLDOWN_SECONDS: z.coerce.number().default(30),
  SCRAPER_MAX_POSTS_PER_RUN: z.coerce.number().default(100),
  SCRAPER_MAX_COMMENTS_PER_THREAD: z.coerce.number().default(50),
  SCRAPER_ACTION_DELAY_MIN_MS: z.coerce.number().default(600),
  SCRAPER_ACTION_DELAY_MAX_MS: z.coerce.number().default(1800),
  RUN_LOCK_TIMEOUT_SECONDS: z.coerce.number().default(3600),
});

export const env = envSchema.parse(process.env);
