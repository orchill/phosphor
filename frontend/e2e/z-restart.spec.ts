import { expect, test } from "./fixtures";
import fs from "node:fs";
import { BASE_URL, killPid, PID_PATH, startServer } from "./server-manager";

test.describe("settings persistence across application restarts", () => {
  test("change survives a full server restart", async ({ page, request }) => {
    test.setTimeout(120_000);

    // 1. change a setting through the UI and save
    await page.goto("/#/settings");
    const input = page.locator("#hist");
    await input.fill("42");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Settings saved/)).toBeVisible();

    // 2. full server restart (the same lifecycle Ctrl+C / start.bat performs)
    const pid = Number(fs.readFileSync(PID_PATH, "utf-8"));
    await killPid(pid);
    let down = false;
    for (let i = 0; i < 40 && !down; i++) {
      try { await fetch(`${BASE_URL}/api/health`); await page.waitForTimeout(300); }
      catch { down = true; }
    }
    expect(down, "server should be down after kill").toBe(true);
    await startServer();

    // 3. the value is still there after the restart
    const api = (await (await request.get(`${BASE_URL}/api/settings`)).json()) as {
      history_limit: number;
    };
    expect(api.history_limit).toBe(42);

    await page.goto("/#/settings");
    await page.reload();
    await expect(page.locator("#hist")).toHaveValue("42");

    // 4. restore the default so later runs are unaffected
    await input.fill("100");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Settings saved/)).toBeVisible();
  });
});
