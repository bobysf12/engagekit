import { env } from "./config";
import { sleep } from "./retry";

export async function applyCooldown(baseSeconds?: number): Promise<void> {
  const base = baseSeconds ?? env.SCRAPER_DEFAULT_COOLDOWN_SECONDS;
  const jitter = Math.random() * base * 0.5;
  const totalSeconds = base + jitter;
  const totalMs = totalSeconds * 1000;

  await sleep(totalMs);
}

export async function actionDelay(): Promise<void> {
  const min = env.SCRAPER_ACTION_DELAY_MIN_MS;
  const max = env.SCRAPER_ACTION_DELAY_MAX_MS;
  const delay = min + Math.random() * (max - min);

  await sleep(delay);
}
