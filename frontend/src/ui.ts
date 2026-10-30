/** Shared Tailwind class constants — the component layer of the design system.
 *
 *  Visual language: phosphor terminal. Squared-off corners, 1px borders on
 *  tokenized surfaces, monospace identity on controls/labels/data, sans for
 *  prose. Colors come exclusively from the semantic tokens in index.css, so
 *  light and dark themes need no per-component dark: variants.
 */
export const CARD =
  "rounded-md border border-line bg-panel";

export const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm px-3.5 py-2 " +
  "font-mono text-[13px] font-medium tracking-tight transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-acc " +
  "focus-visible:ring-offset-1 focus-visible:ring-offset-base " +
  "disabled:opacity-40 disabled:pointer-events-none";

export const BTN_PRIMARY = `${BTN_BASE} bg-acc text-onAcc hover:bg-accHi`;
export const BTN_SECONDARY =
  `${BTN_BASE} border border-line bg-elev/50 text-ink hover:border-ink3 hover:bg-elev`;
export const BTN_DANGER =
  `${BTN_BASE} border border-bad/40 bg-transparent text-bad hover:bg-bad/10`;
export const BTN_GHOST =
  `${BTN_BASE} text-ink2 hover:bg-elev hover:text-ink`;

export const INPUT =
  "w-full rounded-sm border border-line bg-base px-3 py-2 font-mono text-[13px] " +
  "text-ink placeholder:text-ink3 focus:border-acc focus:outline-none focus:ring-1 focus:ring-acc " +
  "disabled:opacity-40";

export const LABEL =
  "block font-mono text-[11px] font-medium uppercase tracking-widest text-ink3";

export const SECTION_TITLE =
  "font-mono text-[15px] font-semibold tracking-tight text-ink";

export const BADGE =
  "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 " +
  "font-mono text-[11px] leading-none";

/** Small square status dot (h-1.5 w-1.5 rounded-[2px]) — pair with a color class. */
export const DOT = "inline-block h-1.5 w-1.5 shrink-0 rounded-[2px]";

/** Monospace page path, e.g. ~/pdf/merge — used as the page identity line. */
export const PAGE_PATH =
  "font-mono text-[11px] tracking-tight text-ink3";
