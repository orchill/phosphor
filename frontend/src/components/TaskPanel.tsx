import { CheckCircle2, ChevronDown, ChevronRight, Download, FolderOutput, Loader2, RotateCw, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cancelTask, downloadUrl, getTaskLog, openOutputFolder } from "../api";
import { emitEvent } from "../events";
import { useToast } from "../ctx";
import { useTask } from "../hooks";
import { useTasks } from "../tasks";
import { TaskRecord, humanSize } from "../types";
import { BADGE, BTN_DANGER, BTN_GHOST, BTN_SECONDARY, CARD, DOT, SECTION_LABEL, STATUS_TONES } from "../ui";

const KIND_LABELS: Record<string, string> = {
  pdf_merge: "Merge PDFs",
  pdf_images: "Images to PDF",
  pdf_pages: "Edit pages",
  pdf_split: "Split PDF",
  pdf_compress: "Compress PDF",
  pdf_extract_images: "Extract images",
  pdf_to_images: "PDF to images",
  media_video: "Video download",
  media_audio: "Audio download",
};

/** File extension for the badge ("report.PDF" -> "pdf"; no extension -> "file"). */
function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1, i + 6).toLowerCase() : "file";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${BADGE} ${STATUS_TONES[status] ?? STATUS_TONES.queued}`}>
      <span className={`${DOT} bg-current`} aria-hidden />
      {status}
    </span>
  );
}

/** 2px bar with a soft accent glow in dark mode (see .bar-glow in index.css).
 *  The shimmer is only used while progress is genuinely unknown. */
function ProgressBar({ value, indeterminate, staged }: {
  value: number | null; indeterminate: boolean; staged: boolean;
}) {
  if (indeterminate) {
    return (
      <div className="h-0.5 w-full overflow-hidden bg-elev" role="progressbar" aria-label="Progress unknown">
        <div className="bar-glow h-full w-1/3 animate-progress bg-acc" />
      </div>
    );
  }
  if (staged && value != null) {
    // media tasks: backend maps download onto 0-0.92, post-processing onto
    // 0.93-1.0 - show the two stages as separate genuine segments.
    const dl = Math.min(value / 0.92, 1);
    const proc = Math.max(0, Math.min((value - 0.92) / 0.08, 1));
    return (
      <div>
        <div className="flex gap-1" role="progressbar"
          aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-0.5 flex-[92] overflow-hidden bg-elev">
            <div className="bar-glow h-full bg-acc transition-[width] duration-300" style={{ width: `${dl * 100}%` }} />
          </div>
          <div className="h-0.5 flex-[8] overflow-hidden bg-elev">
            <div className="h-full bg-info transition-[width] duration-300" style={{ width: `${proc * 100}%` }} />
          </div>
        </div>
        <p className="mt-1 flex justify-between font-mono text-[0.625rem] text-ink3">
          <span>download {Math.round(dl * 100)}%</span>
          <span>process {Math.round(proc * 100)}%</span>
        </p>
      </div>
    );
  }
  return (
    <div className="h-0.5 w-full overflow-hidden bg-elev">
      <div
        className="bar-glow h-full bg-acc transition-[width] duration-300"
        style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
        role="progressbar"
        aria-valuenow={Math.round((value ?? 0) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

function LogViewer({ taskId }: { taskId: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    if (open) { setOpen(false); return; }
    try {
      const r = await getTaskLog(taskId);
      setLines(r.log.slice(-120));
    } catch {
      setLines(["Log is only available while the app is running (not archived)."]);
    }
    setOpen(true);
  };
  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1 font-mono text-[0.6875rem] text-ink3 hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} diagnostics log
      </button>
      {open && (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-sm border border-line bg-base p-3 font-mono text-[0.6875rem] leading-relaxed text-ink2">
          {lines?.length ? lines.join("\n") : "No log output."}
        </pre>
      )}
    </div>
  );
}

export default function TaskPanel({ taskId, onDismiss, onRetry }: {
  taskId: string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  const { task, error: pollError, gone } = useTask(taskId);
  const { track, untrack } = useTasks();
  const toast = useToast();

  // every panel registers its task with the global tray (F1)
  useEffect(() => {
    if (taskId) track(taskId);
  }, [taskId, track]);
  // dismissing a panel also removes the task from the tray
  const dismiss = onDismiss && taskId
    ? () => { untrack(taskId); onDismiss(); }
    : onDismiss;
  const [cancelling, setCancelling] = useState(false);
  const reportedStatus = useRef<string | null>(null);

  // genuine task lifecycle events for the application event log
  useEffect(() => {
    if (!task) return;
    if (reportedStatus.current === task.status) return;
    reportedStatus.current = task.status;
    if (task.status === "completed") emitEvent("info", `${task.title} - completed`, true);
    else if (task.status === "failed") emitEvent("error", `${task.title} - failed: ${task.error || "unknown error"}`, true);
    else if (task.status === "cancelled") emitEvent("warning", `${task.title} - cancelled`, true);
  }, [task]);

  if (!taskId) return null;
  if (gone) {
    return (
      <div className={`${CARD} flex items-center gap-2 border-warn/50 p-4`} data-testid="task-gone" role="alert">
        <p className="min-w-0 flex-1 text-sm text-warn">
          This task no longer exists on the server (it was probably restarted). {pollError}
        </p>
        {dismiss && (
          <button onClick={dismiss} className={BTN_GHOST} aria-label="Dismiss panel"><X size={14} /></button>
        )}
      </div>
    );
  }
  if (!task) return null;

  const running = task.status === "running" || task.status === "queued";
  const indeterminate = task.status === "running" && task.progress == null;
  const kindLabel = KIND_LABELS[task.kind] || task.kind;

  const doCancel = async () => {
    setCancelling(true);
    try {
      await cancelTask(task.id);
      toast.push("info", "Cancellation requested...");
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={`${CARD} p-4`} data-testid="task-panel">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-ink">{task.title}</p>
          <p className="font-mono text-[0.6875rem] text-ink3">
            {kindLabel} · #{task.id.slice(0, 8)}
            {task.finished_at && task.started_at && (
              <> · finished in {Math.max(0, (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000).toFixed(1)}s</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <Loader2 size={16} className="animate-spin text-info" aria-hidden />
          ) : task.status === "completed" ? (
            <CheckCircle2 size={16} className="text-accText" aria-hidden />
          ) : task.status === "failed" ? (
            <XCircle size={16} className="text-bad" aria-hidden />
          ) : null}
          <StatusBadge status={task.status} />
          {running && (
            <button onClick={doCancel} disabled={cancelling} className={BTN_DANGER} aria-label="Cancel task">
              <X size={14} /> cancel
            </button>
          )}
          {dismiss && !running && (
            <button onClick={dismiss} className={BTN_GHOST} aria-label="Dismiss panel"><X size={14} /></button>
          )}
        </div>
      </div>

      {pollError && (
        <p className="mt-2 rounded-sm border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn" role="status">
          Lost contact with the server ({pollError}) - retrying...
        </p>
      )}

      {running && (
        <div className="mt-3">
          <ProgressBar
            value={task.progress}
            indeterminate={indeterminate}
            staged={task.kind.startsWith("media")}
          />
          {/* terminal-style stage line: real backend progress (speed / ETA
              where yt-dlp reports them) */}
          <p className="mt-1.5 truncate rounded-sm border border-line bg-base px-2.5 py-1.5 font-mono text-[0.6875rem] text-info" title={task.stage}>
            <span className="text-accText" aria-hidden>❯ </span>
            <span className="whitespace-pre">{task.stage}</span>
          </p>
        </div>
      )}

      {task.status === "completed" && (
        <div className="mt-3">
          {task.message && <p className="text-sm text-ink2">{task.message}</p>}
          {task.result?.note && (
            <p className="mt-1 rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {task.result.note}
            </p>
          )}
          {(task.result?.outputs || []).length > 0 && (
            <p className={`${SECTION_LABEL} mt-3`}>output</p>
          )}
          <ul className="mt-1.5 space-y-1.5">
            {(task.result?.outputs || []).map((o) => (
              <li key={o.path} className="flex flex-wrap items-center gap-2 rounded-sm bg-elev/60 px-3 py-2">
                <span className="rounded-sm border border-line bg-base px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase text-accText">
                  {extOf(o.name)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-ink" title={o.name}>{o.name}</span>
                <span className="font-mono text-[0.6875rem] text-ink3">{humanSize(o.size)}</span>
                {o.exists === false ? (
                  <span className="font-mono text-[0.6875rem] text-ink3">file missing</span>
                ) : (
                  <>
                    <a href={downloadUrl(o.path)} className={`${BTN_SECONDARY} px-2.5 py-1 text-xs`} download>
                      <Download size={13} aria-hidden /> download
                    </a>
                    <button
                      onClick={async () => {
                        try { await openOutputFolder(); } catch (e: any) { toast.push("error", e.message); }
                      }}
                      className={`${BTN_GHOST} px-2.5 py-1 text-xs`}
                      title="Open the output folder"
                    >
                      <FolderOutput size={13} aria-hidden /> show in folder
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.status === "failed" && (
        <div className="mt-3 rounded-sm border border-bad/40 bg-bad/10 p-3">
          <p className="text-sm font-medium text-bad">Something went wrong</p>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[0.6875rem] text-bad/90">{task.error}</p>
          {onRetry && (
            <button onClick={onRetry} className={`${BTN_SECONDARY} mt-2`}>
              <RotateCw size={13} aria-hidden /> retry
            </button>
          )}
        </div>
      )}

      {(task.status === "failed" || (task.status === "completed" && task.kind.startsWith("media"))) && (
        <div className="mt-3"><LogViewer taskId={task.id} /></div>
      )}
    </div>
  );
}
