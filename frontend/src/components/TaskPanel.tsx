import { CheckCircle2, ChevronDown, ChevronRight, FolderOutput, Loader2, X, XCircle } from "lucide-react";
import { useState } from "react";
import { cancelTask, downloadUrl, getTaskLog, openOutputFolder } from "../api";
import { useToast } from "../ctx";
import { useTask } from "../hooks";
import { TaskRecord, humanSize } from "../types";
import { BADGE, BTN_DANGER, BTN_GHOST, BTN_SECONDARY, CARD, DOT, STATUS_TONES } from "../ui";

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

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${BADGE} ${STATUS_TONES[status] ?? STATUS_TONES.queued}`}>
      <span className={`${DOT} bg-current`} aria-hidden />
      {status}
    </span>
  );
}

function ProgressBar({ value, indeterminate }: { value: number | null; indeterminate: boolean }) {
  const fill = indeterminate
    ? "w-1/3 animate-progress"
    : "";
  return (
    <div className="h-1 w-full overflow-hidden rounded-none bg-elev">
      {indeterminate ? (
        <div className={`h-full ${fill} rounded-none bg-acc`} />
      ) : (
        <div
          className="h-full rounded-none bg-acc transition-[width] duration-300"
          style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
          role="progressbar"
          aria-valuenow={Math.round((value ?? 0) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}
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
        className="flex items-center gap-1 font-mono text-[11px] text-ink3 hover:text-acc focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} diagnostics log
      </button>
      {open && (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-sm border border-line bg-base p-3 font-mono text-[11px] leading-relaxed text-ink2">
          {lines?.length ? lines.join("\n") : "No log output."}
        </pre>
      )}
    </div>
  );
}

export default function TaskPanel({ taskId, onDismiss }: { taskId: string | null; onDismiss?: () => void }) {
  const task = useTask(taskId);
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  if (!taskId || !task) return null;

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
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-semibold text-ink">{task.title}</p>
          <p className="font-mono text-[11px] text-ink3">
            {kindLabel}
            {task.finished_at && task.started_at && (
              <> - finished in {Math.max(0, (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000).toFixed(1)}s</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <Loader2 size={16} className="animate-spin text-info" aria-hidden />
          ) : task.status === "completed" ? (
            <CheckCircle2 size={16} className="text-acc" aria-hidden />
          ) : task.status === "failed" ? (
            <XCircle size={16} className="text-bad" aria-hidden />
          ) : null}
          <StatusBadge status={task.status} />
          {running && (
            <button onClick={doCancel} disabled={cancelling} className={BTN_DANGER} aria-label="Cancel task">
              <X size={14} /> Cancel
            </button>
          )}
          {onDismiss && !running && (
            <button onClick={onDismiss} className={BTN_GHOST} aria-label="Dismiss panel"><X size={14} /></button>
          )}
        </div>
      </div>

      {running && (
        <div className="mt-3">
          <ProgressBar value={task.progress} indeterminate={indeterminate} />
          <p className="mt-1.5 font-mono text-[11px] text-ink3">{task.stage}</p>
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
          <ul className="mt-2 space-y-1.5">
            {(task.result?.outputs || []).map((o) => (
              <li key={o.path} className="flex flex-wrap items-center gap-2 rounded-sm bg-elev/60 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={o.name}>{o.name}</span>
                <span className="font-mono text-[11px] text-ink3">{humanSize(o.size)}</span>
                <a href={downloadUrl(o.path)} className={BTN_SECONDARY} download>
                  Download
                </a>
              </li>
            ))}
          </ul>
          <button
            onClick={async () => {
              try { await openOutputFolder(); } catch (e: any) { toast.push("error", e.message); }
            }}
            className={`${BTN_GHOST} mt-2 text-xs`}
          >
            <FolderOutput size={14} /> Open output folder
          </button>
        </div>
      )}

      {task.status === "failed" && (
        <div className="mt-3 rounded-sm border border-bad/40 bg-bad/10 p-3">
          <p className="text-sm font-medium text-bad">Something went wrong</p>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-bad/90">{task.error}</p>
        </div>
      )}

      {(task.status === "failed" || (task.status === "completed" && task.kind.startsWith("media"))) && (
        <div className="mt-3"><LogViewer taskId={task.id} /></div>
      )}
    </div>
  );
}
