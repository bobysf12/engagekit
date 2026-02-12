import type { Page } from "playwright";
import { AuthError } from "../../core/errors";
import { THREADS_SELECTORS } from "./selectors";
import { actionDelay } from "../../core/cooldown";

export async function performThreadsLogin(page: Page, handle: string): Promise<void> {
  await page.goto(THREADS_SELECTORS.HOME_URL);
  await actionDelay();

  const loginButton = page.locator(THREADS_SELECTORS.AUTH.LOGIN_BUTTON).first();
  if (await loginButton.isVisible({ timeout: 5000 })) {
    await loginButton.click();
    await page.waitForLoadState("networkidle");
    await actionDelay();
  }

  await page.waitForLoadState("networkidle");
}

export async function validateThreadsSession(page: Page): Promise<{ isValid: boolean; error: string | null }> {
  try {
    await page.goto(THREADS_SELECTORS.HOME_URL);
    await actionDelay();

    const isLoggedIn = await page
      .locator(THREADS_SELECTORS.AUTH.LOGGED_IN_INDICATOR)
      .isVisible({ timeout: 10000 });

    if (!isLoggedIn) {
      const needsLogin = await page
        .locator(THREADS_SELECTORS.AUTH.LOGOUT_REQUIRED_INDICATOR)
        .isVisible({ timeout: 5000 });

      if (needsLogin) {
        return { isValid: false, error: "SESSION_EXPIRED: Login button visible" };
      }
      return { isValid: false, error: "SESSION_INVALID: Could not verify login state" };
    }

    return { isValid: true, error: null };
  } catch (error: any) {
    return { isValid: false, error: `VALIDATION_ERROR: ${error.message}` };
  }
}

export async function waitForAuthenticatedNavigation(page: Page): Promise<void> {
  try {
    await page.waitForURL(/threads\.net/, { timeout: 30000 });
    await page.waitForLoadState("networkidle");
  } catch {
    throw new AuthError("Navigation timeout", "NAVIGATION_TIMEOUT");
  }
}
