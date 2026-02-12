import type { Page, BrowserContext } from "playwright";
import { AuthError } from "../../core/errors";
import { THREADS_SELECTORS } from "./selectors";
import { actionDelay } from "../../core/cooldown";
import readline from "readline";

const THREADS_ALLOWED_HOSTS = new Set(["threads.com", "www.threads.com"]);
const LOGIN_LINK_SELECTOR = 'a[href*="/login"]';

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function isPageAuthenticatedByHeuristic(
  page: Page,
): Promise<{ isAuthenticated: boolean; url: string; hostname: string | null; loginLinkCount: number }> {
  const url = page.url();
  const hostname = parseHostname(url);
  const loginLinkCount = await page
    .locator(LOGIN_LINK_SELECTOR)
    .count()
    .catch(() => Number.POSITIVE_INFINITY);

  const isAuthenticated =
    hostname !== null && THREADS_ALLOWED_HOSTS.has(hostname) && loginLinkCount === 0;

  return { isAuthenticated, url, hostname, loginLinkCount };
}

async function waitForThreadsAuthenticatedSession(
  page: Page,
  timeoutMs = 120000,
  pollIntervalMs = 1500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const contextPages = page.context().pages();
    for (const currentPage of contextPages) {
      const state = await isPageAuthenticatedByHeuristic(currentPage);
      if (state.isAuthenticated) {
        return true;
      }
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  return false;
}

async function hasSessionCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies();
  return cookies.some(
    (c) =>
      c.name === "sessionid" &&
      c.domain.includes("instagram.com") &&
      c.value &&
      c.value.length > 0
  );
}

export async function performThreadsLogin(page: Page, handle: string): Promise<void> {
  await page.goto(THREADS_SELECTORS.HOME_URL, { waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => undefined);
  await actionDelay();

  const loginButton = page.locator(THREADS_SELECTORS.AUTH.LOGIN_BUTTON).first();
  if (await loginButton.isVisible({ timeout: 5000 })) {
    await loginButton.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    await actionDelay();
  }

  console.log("\n========================================");
  console.log("Please complete login in the browser.");
  console.log("Press ENTER in this terminal when done.");
  console.log("========================================\n");

  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Press ENTER after completing login... ", () => {
      rl.close();
      resolve();
    });
  });

  await page.goto(THREADS_SELECTORS.HOME_URL, {
    waitUntil: "domcontentloaded",
    timeout: 12000,
  }).catch(() => undefined);
  await actionDelay();

  const isAuthenticated = await waitForThreadsAuthenticatedSession(page);
  const hasSessionId = await hasSessionCookie(page.context());

  if (!isAuthenticated) {
    throw new AuthError(
      "Login was not completed successfully: URL/login-link check failed. Please ensure you are on threads.com and no login button is visible.",
      "LOGIN_NOT_COMPLETED",
    );
  }

  if (!hasSessionId) {
    throw new AuthError(
      "Login was not completed successfully: sessionid cookie not found. Please ensure you completed full Instagram login.",
      "SESSION_COOKIE_MISSING",
    );
  }
}

export async function validateThreadsSession(page: Page): Promise<{ isValid: boolean; error: string | null }> {
  try {
    await page.goto(THREADS_SELECTORS.HOME_URL, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    await actionDelay();

    const state = await isPageAuthenticatedByHeuristic(page);

    if (!state.isAuthenticated) {
      const reasons: string[] = [];
      if (state.hostname === null) {
        reasons.push("invalid URL");
      } else if (!THREADS_ALLOWED_HOSTS.has(state.hostname)) {
        reasons.push(`unexpected host: ${state.hostname}`);
      }
      if (state.loginLinkCount > 0) {
        reasons.push(`login links visible (${state.loginLinkCount})`);
      }
      const reasonText = reasons.length > 0 ? reasons.join(", ") : "unknown reason";
      return {
        isValid: false,
        error: `SESSION_INVALID: URL/login-link check failed - ${reasonText}`,
      };
    }

    const hasSessionId = await hasSessionCookie(page.context());
    if (!hasSessionId) {
      return {
        isValid: false,
        error: "SESSION_COOKIE_MISSING: sessionid cookie not found from .instagram.com",
      };
    }

    return { isValid: true, error: null };
  } catch (error: any) {
    return { isValid: false, error: `VALIDATION_ERROR: ${error.message}` };
  }
}

export async function waitForAuthenticatedNavigation(page: Page): Promise<void> {
  try {
    await page.waitForURL(/threads\.net/, { timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    throw new AuthError("Navigation timeout", "NAVIGATION_TIMEOUT");
  }
}
