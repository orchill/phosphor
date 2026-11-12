import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Visual study harness only: `npm run shots` (see e2e/screenshots.spec.ts).
 *  Same isolated server setup as the regression suite. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /screenshots\.spec\.ts/,
  timeout: 120_000,
});
