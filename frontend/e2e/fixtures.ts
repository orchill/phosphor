/** Shared Playwright test fixtures. The default export seeds the onboarding
 *  "already seen" flag so tests exercise the app itself; the raw base test
 *  remains available for the onboarding test. */
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  onboardingSeen: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        localStorage.setItem("pms-onboarded-v1", "1");
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
