/** Shared Tailwind class constants — the component layer of the design system.
 *
 *  Phosphor Terminal 2.0: squared-off corners (cards 4px, controls 2px),
 *  1px borders on tokenized surfaces, one monospace typeface (JetBrains Mono)
 *  for everything; `font-sans` is opt-in. Colors come exclusively from the
 *  semantic tokens in index.css, so light and dark themes need no
 *  per-component dark: variants.
 *
 *  CASING AND VOICE (V2) - follow these when adding or changing UI text:
 *  - Navigation, labels, buttons, badges, tabs and paths: lowercase
 *    ("merge pdfs", "download", "fetch info", "~/pdf-tools").
 *  - Page titles: lowercase, prefixed with a prompt glyph by <PageHeader>
 *    ("❯ merge pdfs"). Never type the glyph by hand.
 *  - Section/field micro-labels: keep the UPPERCASE micro-label style
 *    (LABEL, SECTION_LABEL, SECTION_TITLE apply it via CSS). This is the one
 *    intentional exception, so write their source text in lowercase.
 *  - Prose (descriptions, toasts, errors, helper text): sentence case.
 *  - When prose mentions a UI element, use its lowercase name
 *    ("open the cookies / sign-in tab").
 */
export const CARD =
  "rounded border border-line bg-panel shadow-card";

export const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm px-3.5 py-2 " +
  "font-mono text-sm font-medium tracking-tight transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-acc " +
  "focus-visible:ring-offset-1 focus-visible:ring-offset-base " +
  "disabled:opacity-40 disabled:pointer-events-none";

export const BTN_PRIMARY = `${BTN_BASE} bg-acc text-onAcc hover:bg-accHi`;
export const BTN_SECONDARY =
  `${BTN_BASE} border border-line bg-transparent text-ink hover:border-ink3 hover:bg-elev/60`;
export const BTN_DANGER =
  `${BTN_BASE} border border-bad/40 bg-transparent text-bad hover:bg-bad/10`;
export const BTN_GHOST =
  `${BTN_BASE} text-ink2 hover:bg-elev hover:text-ink`;

export const INPUT =
  "w-full rounded-sm border border-line bg-base px-3 py-2 font-mono text-sm " +
  "text-ink placeholder:text-ink3 focus:border-acc focus:outline-none focus:ring-1 focus:ring-acc " +
  "disabled:opacity-40";

export const LABEL =
  "block font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-ink3";

/** Card / panel header: compact uppercase technical label. */
export const SECTION_LABEL = LABEL;

/** Page and section titles: compact uppercase monospace. */
export const SECTION_TITLE =
  "font-mono text-sm font-semibold uppercase tracking-[0.08em] text-ink";

export const BADGE =
  "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 " +
  "font-mono text-[0.6875rem] leading-none";

/** Small square status indicator — pair with a token color class. */
export const DOT = "inline-block h-1.5 w-1.5 shrink-0 rounded-[2px]";

/** Canonical status → token color mapping (badges, dots, terminal rows). */
export const STATUS_TONES: Record<string, string> = {
  completed: "border-acc/40 bg-acc/10 text-accText",
  failed: "border-bad/40 bg-bad/10 text-bad",
  cancelled: "border-line bg-elev text-ink3",
  running: "border-info/40 bg-info/10 text-info",
  queued: "border-warn/40 bg-warn/10 text-warn",
};

/** Monospace page path, e.g. ~/pdf/merge — used as the page identity line. */
export const PAGE_PATH =
  "font-mono text-[0.6875rem] tracking-tight text-ink3";
