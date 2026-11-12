/* Runs synchronously from <head>, before the first paint, so the page never
 * flashes the wrong theme. It must be a separate same-origin file: the CSP is
 * `script-src 'self'`, which blocks inline scripts. Keep it dependency-free
 * and in sync with src/appearance.ts (same localStorage keys and defaults). */
(function () {
  try {
    var root = document.documentElement;
    var store = window.localStorage;
    var dark = store.getItem("pms-theme") !== "light";
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    root.style.fontSize = store.getItem("pms-density") === "compact" ? "100%" : "106.25%";
  } catch (e) {
    /* storage unavailable: the CSS defaults apply */
  }
})();
