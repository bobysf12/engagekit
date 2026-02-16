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
  SCRAPER_ACCOUNT_TIMEOUT_SECONDS: z.coerce.number().default(600),
  RUN_LOCK_TIMEOUT_SECONDS: z.coerce.number().default(3600),
  TRIAGE_ENABLED: z.string().default("false").transform((v) => v === "true"),
  DEEP_SCRAPE_ENABLED: z.string().default("false").transform((v) => v === "true"),
  DRAFTS_ENABLED: z.string().default("false").transform((v) => v === "true"),
  API_ENABLED: z.string().default("false").transform((v) => v === "true"),
  SCHEDULER_ENABLED: z.string().default("false").transform((v) => v === "true"),
  CRON_EXECUTION_TIMEOUT_SECONDS: z.coerce.number().default(420),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-3-haiku"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  SELECTION_TOP_N: z.coerce.number().default(20),
  SELECTION_SCORE_THRESHOLD: z.coerce.number().default(75),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default("127.0.0.1"),
});

export const env = envSchema.parse(process.env);
