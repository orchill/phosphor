import { expect, test as base } from "@playwright/test";
import { test } from "./fixtures";
import type { Page } from "@playwright/test";

/** The desktop sidebar (mobile chips + page content share the same labels). */
function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "Main navigation" });
}
function nav(page: Page, name: string) {
  return sidebar(page).getByRole("button", { name, exact: true });
}

test.describe("navigation & routing", () => {
  test("dashboard renders by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^phosphor/ })).toBeVisible();
    await expect(page.getByText("local PDF & media console - nothing leaves this computer")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your private PDF & media toolbox/ })).toBeVisible();
    await expect(sidebar(page)).toBeVisible();
  });

  test("hash deep-links open the right tool with breadcrumb", async ({ page }) => {
    await page.goto("/#/pdf/compress");
    await expect(page.getByRole("heading", { name: "Compress PDF" })).toBeVisible();
    const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumb.getByText("~/pdf-tools")).toBeVisible();
    await expect(crumb.getByText("compress")).toBeVisible();
  });

  test("unknown hash falls back to the dashboard", async ({ page }) => {
    await page.goto("/#/no/such/route");
    await expect(page.getByRole("heading", { name: /Your private PDF & media toolbox/ })).toBeVisible();
  });

  test("PDF Tools landing lists all categories and tools", async ({ page }) => {
    await page.goto("/#/pdf");
    for (const cat of ["organize", "convert", "optimize", "extract"]) {
      await expect(page.getByRole("heading", { name: cat, exact: true })).toBeVisible();
    }
    for (const tool of ["Merge PDFs", "Split / Extract", "Organize Pages", "Images to PDF", "PDF to Images", "Compress PDF", "Extract Images"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${tool}`) })).toBeVisible();
    }
  });

  test("sidebar navigation updates the hash and content", async ({ page }) => {
    await page.goto("/");
    await nav(page, "media downloader").click();
    await expect(page).toHaveURL(/#\/media/);
    await expect(page.getByRole("heading", { name: "Media Downloader" })).toBeVisible();
    await nav(page, "settings").click();
    await expect(page).toHaveURL(/#\/settings/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("browser back/forward traverse the route history", async ({ page }) => {
    await page.goto("/#/pdf/merge");
    await expect(page.getByRole("heading", { name: "Merge PDFs" })).toBeVisible();
    await nav(page, "home").click();
    await expect(page).toHaveURL(/#\/$/);
    await nav(page, "task history").click();
    await expect(page).toHaveURL(/#\/history/);
    await page.goBack(); // -> #/
    await expect(page).toHaveURL(/#\/$/);
    await page.goBack(); // -> #/pdf/merge
    await expect(page).toHaveURL(/#\/pdf\/merge/);
    await expect(page.getByRole("heading", { name: "Merge PDFs" })).toBeVisible();
    await page.goForward(); // -> #/
    await expect(page).toHaveURL(/#\/$/);
  });

  test("PDF Tools section collapses and auto-expands", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /pdf tools section/i });
    // collapsed on Home by default, tools hidden
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav(page, "merge pdfs")).toHaveCount(0);
    // expand via the chevron
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await nav(page, "merge pdfs").click();
    await expect(page).toHaveURL(/#\/pdf\/merge/);
    // the group stays expanded while inside a tool; chevron collapses it
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#\/pdf\/merge/);
  });

  test("command palette opens with Ctrl+K, filters and navigates", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await page.getByRole("combobox", { name: "Search commands" }).fill("comp");
    await dialog.getByRole("option", { name: "Compress PDF" }).click();
    await expect(page).toHaveURL(/#\/pdf\/compress/);
    await expect(page.getByRole("heading", { name: "Compress PDF" })).toBeVisible();

    // Escape closes the palette
    await page.keyboard.press("Control+K");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  base("first launch shows the onboarding intro exactly once", async ({ page }) => {
    // raw base test: no seeded flag -> intro appears
    await page.goto("/");
    const intro = page.getByRole("dialog", { name: "Welcome to phosphor" });
    await expect(intro).toBeVisible();
    const next = intro.getByRole("button", { name: "next" });
    await next.click();
    await next.click();
    await next.click();
    await intro.getByRole("button", { name: "got it" }).click();
    await expect(intro).toBeHidden();
    // does not reappear after reload
    await page.reload();
    await expect(
      page.getByRole("dialog", { name: "Welcome to phosphor" }),
    ).toBeHidden();
  });
});
