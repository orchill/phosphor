import { useEffect, useRef, useState } from "react";
import { ListChecks, Trash2, X } from "lucide-react";
import { useTasks } from "../tasks";
import { useFocusTrap } from "../hooks";
import { isTerminal } from "../types";
import { BTN_GHOST, BTN_SECONDARY, DOT } from "../ui";
import TaskPanel from "./TaskPanel";

/** Header badge + right-hand drawer with the live panels of every task
 *  started in this browser session, whichever page launched it (F1). */
export default function TaskTray() {
  const { tasks, running, untrack } = useTasks();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(drawerRef, open);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (tasks.length === 0) return null;

  const finished = tasks.filter((t) => t.gone || (t.task && isTerminal(t.task.status)));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="task-tray-button"
        aria-haspopup="dialog"
        aria-label={running > 0 ? `${running} running task${running === 1 ? "" : "s"} - open task tray` : `${tasks.length} recent tasks - open task tray`}
        className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[0.6875rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
          running > 0
            ? "border-info/40 bg-info/10 text-info hover:bg-info/20"
            : "border-line text-ink3 hover:border-ink3 hover:text-ink2"
        }`}
      >
        {running > 0 ? (
          <><span className={`${DOT} bg-info`} aria-hidden />{running} running</>
        ) : (
          <><ListChecks size={13} aria-hidden />{tasks.length} task{tasks.length === 1 ? "" : "s"}</>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Tasks"
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-base shadow-lg"
          >
            <header className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
              <h2 className="glow font-mono text-sm font-semibold tracking-tight text-ink">
                <span className="mr-2 text-accText" aria-hidden>❯</span>tasks
              </h2>
              <span className="font-mono text-[0.6875rem] text-ink3">{running} running</span>
              {finished.length > 0 && (
                <button
                  onClick={() => finished.forEach((t) => untrack(t.id))}
                  className={`${BTN_SECONDARY} ml-auto px-2 py-1 text-xs`}
                >
                  <Trash2 size={12} aria-hidden /> clear finished
                </button>
              )}
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                className={`${BTN_GHOST} px-2 py-1 ${finished.length > 0 ? "" : "ml-auto"}`}
                aria-label="Close task tray"
              >
                <X size={15} aria-hidden />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {tasks.map((t) => (
                <TaskPanel key={t.id} taskId={t.id} onDismiss={() => untrack(t.id)} />
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
