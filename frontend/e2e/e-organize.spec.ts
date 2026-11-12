import { expect, test } from "./fixtures";
import path from "node:path";
import { FIXTURES } from "./server-manager";

/** B17: Organize grid - rotation must stay inside the tile and reordering
 *  must not remount (and therefore reload) the thumbnails. */
test.describe("organize page grid", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/pdf/organize");
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "a.pdf"));
    await expect(page.locator("ul[role=list] img").first()).toBeVisible();
  });

  test("a rotated thumbnail stays inside its tile", async ({ page }) => {
    const tile = page.locator("ul[role=list] > li").first();
    await page.getByRole("button", { name: "Rotate page 1 right" }).click();
    const t = (await tile.boundingBox())!;
    const i = (await tile.locator("img").boundingBox())!;
    const slack = 1; // sub-pixel rounding
    expect(i.x).toBeGreaterThanOrEqual(t.x - slack);
    expect(i.y).toBeGreaterThanOrEqual(t.y - slack);
    expect(i.x + i.width).toBeLessThanOrEqual(t.x + t.width + slack);
    expect(i.y + i.height).toBeLessThanOrEqual(t.y + t.height + slack);
  });

  test("moving a page keeps the same <img> elements (no reload flicker)", async ({ page }) => {
    await page.evaluate(() =>
      document.querySelectorAll("ul[role=list] img").forEach((el, n) => {
        (el as unknown as { __probe: number }).__probe = n;
      }));
    await page.getByRole("button", { name: "Move page 1 to a later position" }).click();
    const preserved = await page.evaluate(() =>
      Array.from(document.querySelectorAll("ul[role=list] img")).every((el) => "__probe" in el));
    expect(preserved).toBe(true);
  });
});
