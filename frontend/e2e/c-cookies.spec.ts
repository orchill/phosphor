import { expect, test } from "./fixtures";
import { BASE_URL } from "./server-manager";

const SECRET_VALUE = "g.000-E2E-secret-9f3a";

const HEADER_COOKIES = [
  "VISITOR_INFO1_LIVE=public1",
  `SID=${SECRET_VALUE}`,
  "HSID=public2",
  "SAPISID=public3",
].join("; ");

test.describe("cookie sign-in", () => {
  test("paste import stores cookies without ever exposing values", async ({ page, request }) => {
    await page.goto("/#/media");
    await page.getByRole("tab", { name: /Cookies \/ Sign-in/ }).click();
    await page.getByRole("radio", { name: "Paste cookies file" }).click();
    await page.locator("#cookietext").fill(HEADER_COOKIES);
    await page.getByRole("button", { name: "Save sign-in settings" }).click();

    // UI status is masked: counts and domains only
    await expect(page.locator('[data-testid="cookies-panel"]')).toContainText(
      "Active - cookie file with 4 cookies", { timeout: 15_000 });

    // API exposes a masked summary only - never the stored values
    const status = await request.get(`${BASE_URL}/api/media/cookies`);
    const body = await status.text();
    expect(status.ok()).toBeTruthy();
    expect(body).not.toContain(SECRET_VALUE);
    expect(body).not.toContain("public3");
    const json = JSON.parse(body) as { source: string; cookie_count: number };
    expect(json.source).toBe("file");
    expect(json.cookie_count).toBe(4);

    // the generic settings API carries no cookie preferences at all
    const settings = await (await request.get(`${BASE_URL}/api/settings`)).text();
    expect(settings).not.toContain("cookie_source");
    expect(settings).not.toContain(SECRET_VALUE);
  });

  test("clear cookies removes the stored session", async ({ page, request }) => {
    await page.goto("/#/media");
    await page.getByRole("tab", { name: /Cookies \/ Sign-in/ }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Clear cookies" }).click();
    await expect(page.locator('[data-testid="cookies-panel"]')).toContainText(
      "Not configured", { timeout: 15_000 });
    const json = (await (await request.get(`${BASE_URL}/api/media/cookies`)).json()) as {
      source: string; file_present: boolean;
    };
    expect(json.source).toBe("none");
    expect(json.file_present).toBe(false);
  });
});
