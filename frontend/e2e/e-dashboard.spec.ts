import { expect, test } from "./fixtures";
import { BASE_URL } from "./server-manager";

test.describe("dashboard content", () => {
  test("shows the real output folder, not a hard-coded path", async ({ page, request }) => {
    const info = (await (await request.get(`${BASE_URL}/api/system/info`)).json()) as { output_dir: string };
    await page.goto("/");
    await expect(page.getByText(/pdf-media-studio/)).toHaveCount(0);
    // the hero path is middle-truncated for display; the full path is the tooltip
    await expect(page.getByTitle(`${info.output_dir} (click to copy)`)).toBeVisible();
  });

  test("deep link to a task narrows history to that task", async ({ page, request }) => {
    const tasks = (await (await request.get(`${BASE_URL}/api/tasks?limit=5`)).json()) as { id: string }[];
    test.skip(tasks.length === 0, "needs at least one task from an earlier spec");
    await page.goto(`/#/history?task=${tasks[0].id}`);
    await expect(page.getByRole("heading", { name: /task history/i })).toBeVisible();
    await expect(page.getByText(`showing task #${tasks[0].id.slice(0, 8)}`)).toBeVisible();
    await page.getByRole("button", { name: "show all" }).click();
    await expect(page.getByText(/showing task/)).toHaveCount(0);
  });

  test("settings deep link lands on the diagnostics section", async ({ page }) => {
    await page.goto("/#/settings?section=diagnostics");
    await expect(page.getByRole("heading", { name: "diagnostics" })).toBeInViewport();
  });
});
