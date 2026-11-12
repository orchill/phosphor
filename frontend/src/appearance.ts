/** Appearance preferences (theme, density) persisted in localStorage.
 *
 *  Applied synchronously, before React mounts (see main.tsx) and - earlier
 *  still - by public/theme-init.js from <head>, so the first paint already has
 *  the right theme. Keys keep their historical `pms-` prefix on purpose: they
 *  predate the phosphor rename and renaming them would reset users' settings.
 */
export type Theme = "dark" | "light";
export type Density = "comfortable" | "compact";

export const THEME_KEY = "pms-theme";
export const DENSITY_KEY = "pms-density";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled: preference just isn't persisted */
  }
}

/** Dark-first: the phosphor palette is the intended default experience. */
export function readTheme(): Theme {
  return read(THEME_KEY) === "light" ? "light" : "dark";
}

export function readDensity(): Density {
  return read(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  // Browser chrome (mobile address bar, PWA frame) follows the page background.
  const base = getComputedStyle(root).getPropertyValue("--c-base").trim();
  if (base) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", `rgb(${base})`);
  }
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyDensity(density: Density = readDensity()): void {
  document.documentElement.style.fontSize = density === "compact" ? "100%" : "106.25%";
}

export function saveDensity(density: Density): void {
  write(DENSITY_KEY, density);
  applyDensity(density);
  window.dispatchEvent(new Event(DENSITY_KEY));
}

/** Apply every stored preference. Call once, before the first render. */
export function applyStoredAppearance(): void {
  applyTheme(readTheme());
  applyDensity();
}
