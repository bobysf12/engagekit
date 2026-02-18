import { chromium, type BrowserContext } from "playwright";
import { mkdir, access } from "fs/promises";
import { join } from "path";
import { logger } from "../core/logger";
import { env } from "../core/config";
import type { StorageState } from "./playwright-session-state";

export const PERSISTENT_SESSIONS_DIR = join(process.cwd(), "data", "sessions", "profiles");

export function getPersistentProfileDir(accountId: number, platform: string): string {
  return join(PERSISTENT_SESSIONS_DIR, `${platform}-account-${accountId}`);
}

export async function ensureProfileDir(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
    logger.debug({ profileDir: dir }, "Created persistent browser profile directory");
  }
}

export async function profileExists(dir: string): Promise<boolean> {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

export interface PersistentContextResult {
  context: BrowserContext;
  profileDir: string;
  isNew: boolean;
}

const BLOCK_CHALLENGE_PATTERNS = [
  /\/challenge\//i,
  /\/checkpoint\//i,
  /\/login/i,
  /\/consent/i,
  /\/privacy\/consent/i,
  /\/auth\//i,
  /blocked/i,
  /suspended/i,
  /restricted/i,
  /verify.*identity/i,
  /security.*check/i,
];

export function detectBlockChallenge(url: string): { isBlocked: boolean; reason: string | null } {
  for (const pattern of BLOCK_CHALLENGE_PATTERNS) {
    if (pattern.test(url)) {
      const match = url.match(pattern);
      return { isBlocked: true, reason: `BLOCK_DETECTED:url_pattern:${match?.[0] || pattern.source}` };
    }
  }
  return { isBlocked: false, reason: null };
}

export async function hydrateContextFromStorageState(
  context: BrowserContext,
  storageState: StorageState,
): Promise<void> {
  if (storageState.cookies && storageState.cookies.length > 0) {
    await context.addCookies(storageState.cookies as any);
  }

  if (storageState.origins && storageState.origins.length > 0) {
    for (const originState of storageState.origins) {
      const localStorageEntries = originState.localStorage ?? [];
      if (localStorageEntries.length === 0) continue;

      const page = await context.newPage();
      try {
        await page.goto(originState.origin, { waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => undefined);
        await page.evaluate((entries) => {
          for (const entry of entries) {
            try {
              window.localStorage.setItem(entry.name, entry.value);
            } catch {
              // Ignore localStorage write failures for unsupported origins.
            }
          }
        }, localStorageEntries);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  }
}

export async function launchPersistentContext(
  accountId: number,
  platform: string,
  options?: {
    headless?: boolean;
    slowMo?: number;
    storageState?: StorageState;
  }
): Promise<PersistentContextResult> {
  const profileDir = getPersistentProfileDir(accountId, platform);
  await ensureProfileDir(profileDir);

  const isNew = !(await profileExists(join(profileDir, "Default")));

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: options?.headless ?? env.PLAYWRIGHT_HEADLESS,
    slowMo: options?.slowMo ?? env.PLAYWRIGHT_SLOW_MO,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
    ],
  });

  if (isNew && options?.storageState) {
    try {
      await hydrateContextFromStorageState(context, options.storageState);
      logger.info(
        { accountId, platform, profileDir, cookieCount: options.storageState.cookies?.length ?? 0 },
        "Hydrated new persistent context from storageState"
      );
    } catch (error) {
      logger.warn(
        { accountId, platform, profileDir, error },
        "Failed to hydrate persistent context from storageState"
      );
    }
  }

  logger.info(
    { accountId, platform, profileDir, isNew },
    "Launched persistent browser context"
  );

  return { context, profileDir, isNew };
}

export async function closeContextSafely(context: BrowserContext | null): Promise<void> {
  if (!context) return;

  try {
    const pages = context.pages();
    for (const page of pages) {
      try {
        await page.close().catch(() => {});
      } catch {}
    }

    await context.close();
  } catch (error) {
    logger.debug({ error }, "Error closing browser context (non-fatal)");
  }
}
