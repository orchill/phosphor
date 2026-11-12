/** Visual study harness (Phase A). NOT part of the regular suite's assertions:
 *  it only captures PNGs to e2e/.shots/ (gitignored) so every screen can be
 *  reviewed before and after a visual change.
 *
 *      npm run shots                 # full matrix
 *      SHOTS_QUICK=1 npm run shots   # 1280x860, dark, comfortable only
 *
 *  Files are named  <screen>__<W>x<H>__<theme>__<density>.png
 *
 *  Task panels are rendered from mocked /api/tasks/<id> responses so the
 *  running / failed states are deterministic (no timing, no real failures).
 */
import { expect, test as fixtureTest } from "./fixtures";
import { test as rawTest } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { FIXTURES } from "./server-manager";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, ".shots");
const STUB_URL = "https://93.184.216.34/e2e.mp4"; // never fetched: the stub yt-dlp answers
const QUICK = !!process.env.SHOTS_QUICK;

type Theme = "dark" | "light";
type Density = "comfortable" | "compact";
interface Viewport { w: number; h: number }

const VIEWPORTS: Viewport[] = QUICK
  ? [{ w: 1280, h: 860 }]
  : [{ w: 1280, h: 860 }, { w: 1920, h: 1080 }, { w: 390, h: 844 }];
const THEMES: Theme[] = QUICK ? ["dark"] : ["dark", "light"];
const DENSITIES: Density[] = QUICK ? ["comfortable"] : ["comfortable", "compact"];

const ROUTES: [string, string][] = [
  ["dashboard", "/#/"], ["pdf-tools", "/#/pdf"], ["merge", "/#/pdf/merge"],
  ["images-to-pdf", "/#/pdf/images"], ["organize", "/#/pdf/organize"],
  ["split", "/#/pdf/split"], ["compress", "/#/pdf/compress"],
  ["extract-images", "/#/pdf/extract"], ["pdf-to-images", "/#/pdf/toimages"],
  ["media", "/#/media"], ["history", "/#/history"], ["settings", "/#/settings"],
];

fs.mkdirSync(SHOTS, { recursive: true });

async function prepare(page: Page, vp: Viewport, theme: Theme, density: Density, onboarded = true) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.addInitScript(([t, d, seen]) => {
    localStorage.setItem("pms-theme", t as string);
    localStorage.setItem("pms-density", d as string);
    if (seen) localStorage.setItem("pms-onboarded-v1", "1");
    else localStorage.removeItem("pms-onboarded-v1");
  }, [theme, density, onboarded] as const);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350); // route fade-in + thumbnails
}

async function shot(page: Page, name: string, vp: Viewport, theme: Theme, density: Density) {
  await settle(page);
  await page.screenshot({
    path: path.join(SHOTS, `${name}__${vp.w}x${vp.h}__${theme}__${density}.png`),
    animations: "disabled",
    fullPage: false,
  });
}

/** Mock one task id with a fixed record (running / completed / failed). */
async function mockTask(page: Page, id: string, patch: Record<string, unknown>) {
  const base = {
    id, kind: "media_video", title: "E2E Stub Video", status: "running", progress: 0.45,
    stage: "[download]  45.2%  3.4 MB/s  eta 0:12  stream 1/2 (video)",
    message: "", error: "", result: {}, log_tail: [], meta: {},
    created_at: new Date().toISOString(), started_at: new Date().toISOString(), finished_at: null,
  };
  await page.route(`**/api/tasks/${id}`, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...base, ...patch }) }));
}

/** Seed one real completed task so History / Dashboard have content. */
fixtureTest.describe.configure({ mode: "serial" });
fixtureTest("seed: one real merge for History and Dashboard", async ({ page }) => {
  await page.goto("/#/pdf/merge");
  await page.locator('input[type="file"]').setInputFiles([
    path.join(FIXTURES, "a.pdf"), path.join(FIXTURES, "b.pdf"),
  ]);
  await page.getByRole("button", { name: /merge 2 pdfs/i }).click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible({ timeout: 45_000 });
});

fixtureTest.describe("routes x viewport x theme x density", () => {
  for (const vp of VIEWPORTS) for (const theme of THEMES) for (const density of DENSITIES) {
    for (const [name, url] of ROUTES) {
      fixtureTest(`${name} ${vp.w}x${vp.h} ${theme} ${density}`, async ({ page }) => {
        await prepare(page, vp, theme, density);
        await page.goto(url);
        await shot(page, name, vp, theme, density);
      });
    }
  }
});

/** Interactive states: 1280 and 390, both themes, comfortable density. */
const STATE_VPS: Viewport[] = QUICK ? [VIEWPORTS[0]] : [VIEWPORTS[0], VIEWPORTS[VIEWPORTS.length - 1]];

fixtureTest.describe("states", () => {
  for (const vp of STATE_VPS) for (const theme of THEMES) {
    const tag = `${vp.w}x${vp.h} ${theme}`;

    fixtureTest(`media info + task panels ${tag}`, async ({ page }) => {
      await prepare(page, vp, theme, "comfortable");
      await page.goto("/#/media");
      await page.locator("#mediaurl").fill(STUB_URL);
      await page.getByRole("button", { name: /fetch info/i }).click();
      await expect(page.getByRole("heading", { name: "E2E Stub Video" })).toBeVisible({ timeout: 45_000 });
      await shot(page, "media-info", vp, theme, "comfortable");

      // each state: answer the download POST with a fixed id, then mock that task
      const states: [string, string, Record<string, unknown>][] = [
        ["task-running", "shot-running", {}],
        ["task-completed", "shot-done", {
          status: "completed", progress: 1, stage: "Done", message: "Saved e2e-video.mp4",
          finished_at: new Date().toISOString(),
          result: { outputs: [{ name: "e2e-video.mp4", path: "/x/e2e-video.mp4", size: 5_300_000, url: "", exists: true }] },
        }],
        ["task-failed", "shot-failed", {
          status: "failed", progress: null, stage: "Failed",
          error: "ERROR: [youtube] e2e: Sign in to confirm you're not a bot",
          finished_at: new Date().toISOString(),
        }],
      ];
      for (const [label, id, patch] of states) {
        await page.unroute("**/api/media/download").catch(() => {});
        await page.route("**/api/media/download", (r) =>
          r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ task_id: id }) }));
        await mockTask(page, id, patch);
        await page.getByRole("button", { name: /^download/i }).click();
        await expect(page.getByTestId("task-panel")).toBeVisible();
        await page.getByTestId("task-panel").scrollIntoViewIfNeeded();
        await shot(page, label, vp, theme, "comfortable");
      }
    });

    fixtureTest(`organize with a rotated page ${tag}`, async ({ page }) => {
      await prepare(page, vp, theme, "comfortable");
      await page.goto("/#/pdf/organize");
      await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "six.pdf"));
      await expect(page.locator("ul[role=list] img").first()).toBeVisible();
      await page.getByRole("button", { name: "Rotate page 2 right" }).click();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("ul[role=list] img")).every((i) => (i as HTMLImageElement).complete));
      await shot(page, "organize-rotated", vp, theme, "comfortable");
    });

    fixtureTest(`command palette ${tag}`, async ({ page }) => {
      await prepare(page, vp, theme, "comfortable");
      await page.goto("/#/");
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await shot(page, "command-palette", vp, theme, "comfortable");
    });
  }
});

rawTest.describe("onboarding (first launch)", () => {
  for (const vp of STATE_VPS) for (const theme of THEMES) {
    rawTest(`onboarding ${vp.w}x${vp.h} ${theme}`, async ({ page }) => {
      await prepare(page, vp, theme, "comfortable", false);
      await page.goto("/#/");
      await expect(page.getByRole("dialog", { name: "Welcome to phosphor" })).toBeVisible();
      await shot(page, "onboarding", vp, theme, "comfortable");
    });
  }
});
