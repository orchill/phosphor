import { expect, test } from "./fixtures";
import fs from "node:fs";
import path from "node:path";
import { FIXTURES } from "./server-manager";

async function expectCompletedDownload(page: import("@playwright/test").Page) {
  await expect(page.getByText("completed", { exact: true })).toBeVisible({
    timeout: 45_000,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "download" }).first().click();
  const download = await downloadPromise;
  return fs.readFileSync(await download.path());
}

test.describe("PDF tools end-to-end", () => {
  test("merge two uploaded PDFs and download the result", async ({ page }) => {
    await page.goto("/#/pdf/merge");
    await page.locator('input[type="file"]').setInputFiles([
      path.join(FIXTURES, "a.pdf"),
      path.join(FIXTURES, "b.pdf"),
    ]);
    await expect(page.getByText("#1")).toBeVisible();
    await expect(page.getByText("#2")).toBeVisible();
    await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
    const bytes = await expectCompletedDownload(page);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(500);
  });

  test("images to PDF with two PNGs", async ({ page }) => {
    await page.goto("/#/pdf/images");
    await page.locator('input[type="file"]').setInputFiles([
      path.join(FIXTURES, "red.png"),
      path.join(FIXTURES, "blue.png"),
    ]);
    await page.getByRole("button", { name: "Convert 2 images to PDF" }).click();
    const bytes = await expectCompletedDownload(page);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("split extracts a selected page into a new PDF", async ({ page }) => {
    await page.goto("/#/pdf/split");
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "a.pdf"));
    await expect(page.getByRole("button", { name: "Page 1", exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Page 1", exact: false }).first().click();
    await page.getByRole("button", { name: "Extract 1 page(s)" }).click();
    const bytes = await expectCompletedDownload(page);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("compress completes and delivers a downloadable PDF", async ({ page }) => {
    await page.goto("/#/pdf/compress");
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "b.pdf"));
    // Scoped to <main>: the sidebar also has a "compress" nav button.
    await page.locator("main").getByRole("button", { name: "compress", exact: true }).click();
    const bytes = await expectCompletedDownload(page);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    // The fallback path (original delivered when recompression cannot shrink)
    // is asserted deterministically by the backend unit test
    // test_compress_fallback_delivers_original_when_not_smaller; at the UI
    // level either outcome must end completed with a valid download.
    await expect(page.locator("main")).toContainText(/Reduced by|original file is delivered|No reduction possible/);
  });
});
