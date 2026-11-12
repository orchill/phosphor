import { expect, test } from "./fixtures";

const STUB_URL = "https://93.184.216.34/e2e.mp4"; // global IP literal, never fetched (stub yt-dlp)

/** B19: polling a task that no longer exists must stop and say so, not retry forever. */
test.describe("task polling", () => {
  test("stops after repeated 404s and shows a dismissable notice", async ({ page }) => {
    test.setTimeout(90_000);
    let polls = 0;
    await page.route("**/api/tasks/ghost-task", (route) => {
      polls += 1;
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Task not found" }),
      });
    });
    await page.route("**/api/media/download", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ task_id: "ghost-task" }),
      }));

    await page.goto("/#/media");
    await page.locator("#mediaurl").fill(STUB_URL);
    await page.getByRole("button", { name: "Fetch info" }).click();
    await expect(page.getByRole("heading", { name: "E2E Stub Video" })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: /Download best/i }).click();

    const gone = page.getByTestId("task-gone");
    await expect(gone).toContainText(/no longer exists/i, { timeout: 15_000 });
    const settled = polls;
    expect(settled).toBe(3);
    await page.waitForTimeout(6000); // longer than the 2s/4s back-off steps
    expect(polls).toBe(settled);

    await gone.getByRole("button", { name: "Dismiss panel" }).click();
    await expect(gone).toBeHidden();
  });
});
