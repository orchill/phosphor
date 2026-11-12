/** Appearance preferences (theme, density, accent, CRT) persisted in localStorage.
 *
 *  Applied synchronously, before React mounts (see main.tsx) and - earlier
 *  still - by public/theme-init.js from <head>, so the first paint already has
 *  the right theme. Keys keep their historical `pms-` prefix on purpose: they
 *  predate the phosphor rename and renaming them would reset users' settings.
 */
export type Theme = "dark" | "light";
export type Density = "comfortable" | "compact";
/** Phosphor colour: P1 green (default), P3 amber, P4 white/ice. */
export type Accent = "green" | "amber" | "ice";
/** Optional scanline overlay. */
export type Crt = "off" | "subtle";

export const ACCENTS: Accent[] = ["green", "amber", "ice"];
export const CRT_MODES: Crt[] = ["off", "subtle"];

export const THEME_KEY = "pms-theme";
export const DENSITY_KEY = "pms-density";
export const ACCENT_KEY = "pms-accent";
export const CRT_KEY = "pms-crt";

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

export function readAccent(): Accent {
  const v = read(ACCENT_KEY);
  return ACCENTS.includes(v as Accent) ? (v as Accent) : "green";
}

export function readCrt(): Crt {
  return read(CRT_KEY) === "subtle" ? "subtle" : "off";
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

/** Only the non-default accent needs an attribute; green is the :root palette. */
export function applyAccent(accent: Accent = readAccent()): void {
  const root = document.documentElement;
  if (accent === "green") root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", accent);
  // theme-color follows the page background, which the accent does not change
}

export function saveAccent(accent: Accent): void {
  write(ACCENT_KEY, accent);
  applyAccent(accent);
}

export function applyCrt(crt: Crt = readCrt()): void {
  const root = document.documentElement;
  if (crt === "subtle") root.setAttribute("data-crt", "subtle");
  else root.removeAttribute("data-crt");
}

export function saveCrt(crt: Crt): void {
  write(CRT_KEY, crt);
  applyCrt(crt);
}

/** Apply every stored preference. Call once, before the first render. */
export function applyStoredAppearance(): void {
  applyTheme(readTheme());
  applyDensity();
  applyAccent();
  applyCrt();
}
