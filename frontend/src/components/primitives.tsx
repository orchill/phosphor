/** Shared UI primitives (V3): the small pieces every page used to restyle inline.
 *  Class strings come from ui.ts; colors only from tokens (see index.css). */
import { ReactNode } from "react";
import { ROUTE_META, Route, useNav, PDF_ROUTES } from "../ctx";
import { CARD, LABEL, PAGE_PATH } from "../ui";

// ------------------------------------------------------------------ Kbd
/** A keyboard key cap, e.g. <Kbd>Ctrl</Kbd><Kbd>K</Kbd>. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex min-w-[1.375rem] items-center justify-center rounded-sm border border-line bg-elev px-1.5 py-0.5 font-mono text-[0.625rem] font-medium leading-none text-ink2 ${className}`}
    >
      {children}
    </kbd>
  );
}

// ----------------------------------------------------------------- Tabs
export interface TabOption<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Optional status dot color class (e.g. "bg-ok"). */
  dot?: string;
  /** Small trailing marker, e.g. "configured" indicator. */
  trailing?: ReactNode;
}

/** Segmented control. One style for the Media tabs, the Video/Audio switch and
 *  the History filter chips. `semantics="tab"` for switching panels,
 *  `"radio"` for choosing a filter value. */
export function Tabs<T extends string>({
  value, onChange, options, label, semantics = "tab", className = "",
}: {
  value: T;
  onChange: (id: T) => void;
  options: TabOption<T>[];
  label: string;
  semantics?: "tab" | "radio";
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap gap-1 ${className}`}
      role={semantics === "tab" ? "tablist" : "radiogroup"}
      aria-label={label}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role={semantics === "tab" ? "tab" : "radio"}
            {...(semantics === "tab" ? { "aria-selected": active } : { "aria-checked": active })}
            onClick={() => onChange(o.id)}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[0.6875rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
              active
                ? "border-acc bg-acc/10 text-accText"
                : "border-line text-ink3 hover:border-ink3 hover:text-ink2"
            }`}
          >
            {o.dot && <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-[2px] ${o.dot}`} aria-hidden />}
            {o.icon}
            {o.label}
            {o.trailing}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------- PageHeader
/** Breadcrumb path + `❯ title` + description + optional actions.
 *  Replaces the per-page SECTION_TITLE blocks and the shell's breadcrumb. */
export function PageHeader({
  route, description, actions, title,
}: {
  route: Route;
  description?: ReactNode;
  actions?: ReactNode;
  /** Override the route's title (rare). */
  title?: string;
}) {
  const { navigate } = useNav();
  const meta = ROUTE_META[route];
  const inPdfTools = PDF_ROUTES.includes(route) && route !== "pdftools";
  return (
    <header className="space-y-1.5">
      <nav aria-label="Breadcrumb" className={`flex items-center ${PAGE_PATH}`}>
        {inPdfTools ? (
          <>
            <button
              onClick={() => navigate("pdftools")}
              className="rounded-sm hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              ~/pdf-tools
            </button>
            <span className="mx-1.5" aria-hidden>/</span>
            <span className="text-ink2">{meta.crumb.split("/").pop()}</span>
          </>
        ) : (
          <span>{meta.crumb}</span>
        )}
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="glow min-w-0 font-mono text-base font-semibold tracking-tight text-ink">
          <span className="glow mr-2 text-accText" aria-hidden>❯</span>
          {title ?? meta.title}
        </h2>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="max-w-3xl text-sm leading-relaxed text-ink2">{description}</p>}
    </header>
  );
}

// ----------------------------------------------------------------- Stat
export function Stat({
  label, value, tone = "bg-ink3",
}: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-[2px] ${tone}`} aria-hidden />
      <span className="text-ink2">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

// ----------------------------------------------------------- EmptyState
/** One-line terminal prompt instead of a centered paragraph. */
export function EmptyState({
  children, action, className = "",
}: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`${CARD} flex flex-wrap items-center gap-3 px-4 py-3.5 font-mono text-sm text-ink2 ${className}`}>
      <p className="min-w-0 flex-1">
        <span className="text-accText" aria-hidden>❯ </span>
        {children}
        <span className="text-accText" aria-hidden>_</span>
      </p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Field
/** Label + control + helper text. `children` is the input/select itself. */
export function Field({
  label, htmlFor, hint, className = "", children,
}: { label: string; htmlFor?: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label className={LABEL} htmlFor={htmlFor}>{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[0.6875rem] leading-snug text-ink3">{hint}</p>}
    </div>
  );
}
