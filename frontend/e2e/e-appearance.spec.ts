import { expect, test } from "./fixtures";

/** B16: the theme must be applied before the first paint. The head script
 *  (public/theme-init.js) does that; blocking the app bundle proves it works
 *  on its own, i.e. nothing depends on a post-render React effect. */
test.describe("theme bootstrap (no flash)", () => {
  for (const [saved, dark] of [["dark", true], ["light", false], [null, true]] as const) {
    test(`stored theme "${saved ?? "none"}" is applied without the app bundle`, async ({ page }) => {
      await page.addInitScript((v) => {
        if (v) localStorage.setItem("pms-theme", v);
        else localStorage.removeItem("pms-theme");
      }, saved);
      await page.route("**/assets/*.js", (route) => route.abort());
      await page.goto("/");
      const state = await page.evaluate(() => ({
        dark: document.documentElement.classList.contains("dark"),
        scheme: document.documentElement.style.colorScheme,
      }));
      expect(state.dark).toBe(dark);
      expect(state.scheme).toBe(dark ? "dark" : "light");
    });
  }

  test("density is applied before the bundle runs", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("pms-density", "compact"));
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe("100%");
  });

  test("toggling the theme persists it and updates theme-color", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    expect(await page.evaluate(() => localStorage.getItem("pms-theme"))).toBe("light");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
    const color = await page.evaluate(() =>
      document.querySelector('meta[name="theme-color"]')?.getAttribute("content"));
    expect(color).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });
});
