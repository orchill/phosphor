import { expect, test } from "./fixtures";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, RUNDIR } from "./server-manager";

const STUB_URL = "https://93.184.216.34/e2e.mp4"; // global IP literal, never fetched (stub yt-dlp)

async function fetchInfo(page: import("@playwright/test").Page) {
  await page.goto("/#/media");
  await page.locator("#mediaurl").fill(STUB_URL);
  await page.getByRole("button", { name: "Fetch info" }).click();
  await expect(page.getByRole("heading", { name: "E2E Stub Video" })).toBeVisible({
    timeout: 45_000,
  });
}

/** Wait until no queued/running task remains (tests share one server). */
async function waitUntilIdle(request: import("@playwright/test").APIRequestContext) {
  await expect
    .poll(async () => {
      const tasks = (await (await request.get(`${BASE_URL}/api/tasks?limit=100`)).json()) as {
        status: string }[];
      return tasks.filter((t) => t.status === "running" || t.status === "queued").length;
    }, { timeout: 30_000 })
    .toBe(0);
}

async function latestTaskStatus(request: import("@playwright/test").APIRequestContext) {
  const tasks = (await (await request.get(`${BASE_URL}/api/tasks?limit=1`)).json()) as {
    status: string }[];
  return tasks[0]?.status ?? "none";
}

test.describe("media downloader (stub yt-dlp, no network)", () => {
  test("fetch info renders stub metadata, formats and mode tabs", async ({ page }) => {
    await fetchInfo(page);
    await expect(page.getByText("Stub Channel")).toBeVisible();
    await expect(page.getByText(/12:12|0:12/)).toBeVisible(); // duration formatting
    await expect(page.getByText(/formats available/i)).toBeVisible();
    await expect(page.getByRole("tab", { name: /video \(mp4\)/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /audio \(mp3/i })).toBeVisible();
    await expect(page.getByText("advanced options")).toBeVisible(); // progressive disclosure
  });

  test("download runs as a task with progress and a downloadable output", async ({ page }) => {
    await fetchInfo(page);
    await page.getByRole("button", { name: /Download best/i }).click();
    await expect(page.getByText("Download started.")).toBeVisible();
    // the task panel shows live stage/progress, then completes
    await expect(page.getByText("completed", { exact: true })).toBeVisible({ timeout: 45_000 });
    // the output row offers the file for download with its size
    await expect(page.getByText("e2e-video.mp4")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "download" }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync(await download.path());
    expect(bytes.length).toBe(40_000);
    expect(bytes.subarray(0, 8).toString()).toContain("E2E-STUB");
    // no .part leftovers in the output directory
    const outputs = fs.readdirSync(path.join(RUNDIR, "outputs"));
    expect(outputs.some((f) => f.endsWith(".part"))).toBe(false);
  });

  test("a queued download can be cancelled", async ({ page, request }) => {
    await waitUntilIdle(request);
    await fetchInfo(page);
    await page.getByRole("button", { name: /Download best/i }).click(); // occupies the single slot
    await page.getByRole("button", { name: /Download best/i }).click(); // queued behind it
    await expect(page.getByText("queued", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Cancel task" }).click();
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("a running download can be cancelled and leaves no partial file", async ({ page, request }) => {
    test.setTimeout(120_000);
    await waitUntilIdle(request);
    await fetchInfo(page);
    await page.getByRole("button", { name: /Download best/i }).click();
    // wait until THIS task is actually running (not queued behind a leftover)
    await expect
      .poll(async () => latestTaskStatus(request), { timeout: 20_000 })
      .toBe("running");
    // while the stub is still "downloading" (~6s), hit Cancel
    await page.getByRole("button", { name: "Cancel task" }).click({ timeout: 5_000 });
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible({ timeout: 10_000 });
    // .part cleanup is async (kill, reap, unlink) - poll instead of sleeping
    await expect
      .poll(
        () =>
          fs
            .readdirSync(path.join(RUNDIR, "outputs"))
            .filter((f) => f.startsWith("e2e-video") && f.endsWith(".part")).length,
        { timeout: 15_000 },
      )
      .toBe(0);
  });
});
