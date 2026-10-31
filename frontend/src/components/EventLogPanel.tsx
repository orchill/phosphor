import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { AppEvent, EventSeverity, clearEvents, getEvents, subscribeEvents } from "../events";
import { BTN_GHOST, CARD, DOT, SECTION_LABEL } from "../ui";

type Filter = "all" | "info" | "warning" | "error" | "tasks";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "all" },
  { id: "tasks", label: "tasks" },
  { id: "info", label: "info" },
  { id: "warning", label: "warning" },
  { id: "error", label: "error" },
];

function tone(sev: EventSeverity): string {
  return sev === "error" ? "text-bad" : sev === "warning" ? "text-warn" : "text-ink2";
}
function dotTone(sev: EventSeverity): string {
  return sev === "error" ? "bg-bad" : sev === "warning" ? "bg-warn" : "bg-info";
}

/** Collapsible session event panel. Entries are real frontend-observed
 *  application events (API operations and task lifecycle) — session-scoped,
 *  never persisted, and free of cookie/path/subprocess data. */
export default function EventLogPanel() {
  const [events, setEvents] = useState<AppEvent[]>(getEvents);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => subscribeEvents(setEvents), []);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "tasks") return events.filter((e) => e.task);
    return events.filter((e) => e.severity === filter);
  }, [events, filter]);

  const errors = events.filter((e) => e.severity === "error").length;
  const warnings = events.filter((e) => e.severity === "warning").length;

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-sm font-mono text-sm font-semibold uppercase tracking-[0.08em] text-ink hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <ChevronDown size={13} className={`transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
          event log
        </button>
        {errors > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-bad/40 bg-bad/10 px-1.5 py-0.5 font-mono text-[0.6875rem] text-bad">
            <span className={`${DOT} bg-bad`} aria-hidden />{errors} error{errors === 1 ? "" : "s"}
          </span>
        )}
        {warnings > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[0.6875rem] text-warn">
            <span className={`${DOT} bg-warn`} aria-hidden />{warnings} warning{warnings === 1 ? "" : "s"}
          </span>
        )}
        {open && (
          <button
            onClick={() => { clearEvents(); setFilter("all"); }}
            className={`${BTN_GHOST} ml-auto px-2 py-1 text-xs`}
          >
            <Trash2 size={13} aria-hidden /> clear
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Event filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-sm border px-2.5 py-1 font-mono text-[0.6875rem] transition-colors ${
                  filter === f.id ? "border-acc bg-acc/10 text-accText" : "border-line text-ink3 hover:border-ink3 hover:text-ink2"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div
            className="mt-2 max-h-64 overflow-auto rounded-sm border border-line bg-base p-3 font-mono text-[0.6875rem] leading-relaxed"
            role="log"
            aria-label="Application events"
          >
            {filtered.length === 0 ? (
              <p className="text-ink3">No {filter === "all" ? "" : `${filter} `}events this session.</p>
            ) : (
              <ol className="space-y-1">
                {filtered.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <span className="shrink-0 text-ink3">
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>
                    <span className={`${DOT} mt-1 ${dotTone(e.severity)}`} aria-hidden />
                    <span className={`min-w-0 break-words ${tone(e.severity)}`}>{e.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <p className="mt-1.5 text-[0.6875rem] text-ink3">
            Session log - kept in memory only, cleared when the app closes.
          </p>
        </>
      )}
    </div>
  );
}
