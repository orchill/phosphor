import { expect, test } from "./fixtures";

const STUB_URL = "https://93.184.216.34/e2e.mp4"; // never fetched: the stub yt-dlp answers

/** F1: tasks stay visible and announce completion whichever page is open. */
test.describe("global task tray", () => {
  test("a running download follows you across pages and announces completion", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/#/media");
    await page.locator("#mediaurl").fill(STUB_URL);
    await page.getByRole("button", { name: /fetch info/i }).click();
    await expect(page.getByRole("heading", { name: "E2E Stub Video" })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: /download best/i }).click();

    // leave the Media page: the page's own panel unmounts, the tray must not
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "home" }).click();
    const badge = page.getByTestId("task-tray-button");
    await expect(badge).toContainText(/1 running/);
    await expect.poll(() => page.title(), { timeout: 15_000 }).toMatch(/^\[(\d+%|…)\] /);

    await badge.click();
    const drawer = page.getByRole("dialog", { name: "Tasks" });
    await expect(drawer.getByTestId("task-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // completion: toast, badge turns into a plain "1 task", title prefix is gone
    await expect(page.getByText(/E2E Stub Video - completed/)).toBeVisible({ timeout: 60_000 });
    await expect(badge).toContainText(/1 task/);
    await expect.poll(() => page.title()).not.toMatch(/^\[/);

    // survives a reload (sessionStorage) and can be cleared
    await page.reload();
    await expect(page.getByTestId("task-tray-button")).toContainText(/1 task/);
    await page.getByTestId("task-tray-button").click();
    await page.getByRole("button", { name: /clear finished/i }).click();
    await expect(page.getByTestId("task-tray-button")).toHaveCount(0);
  });
});
