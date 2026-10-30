import { useCallback, useEffect, useState } from "react";
import { FolderOutput, RefreshCw, Trash2 } from "lucide-react";
import { StatusBadge } from "../components/TaskPanel";
import { deleteTask, downloadUrl, listTasks, openOutputFolder } from "../api";
import { useToast } from "../ctx";
import { TaskRecord, TaskStatus, humanSize } from "../types";
import { BTN_SECONDARY, CARD, SECTION_TITLE } from "../ui";

/** Backend timestamps are UTC ISO-8601 ("...+00:00" or "...Z") - both parse
 *  directly; the old naive-"Z" append produced "Invalid Date". */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const KIND_LABELS: Record<string, string> = {
  pdf_merge: "Merge", pdf_images: "Images->PDF", pdf_pages: "Pages",
  pdf_split: "Split", pdf_compress: "Compress", pdf_extract_images: "Extract imgs",
  pdf_to_images: "PDF->imgs", media_video: "Video", media_audio: "Audio",
};
const STATUSES: (TaskStatus | "all")[] = ["all", "completed", "failed", "cancelled", "running"];

export default function History() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await listTasks(200, status === "all" ? undefined : status));
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setLoading(false);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
useEffect(() => { refresh(); }, [refresh]);

  const remove = async (id: string) => {
    try {
      await deleteTask(id);
      setTasks((ts) => ts.filter((t) => t.id !== id));
    } catch (e: any) {
      toast.push("error", e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={SECTION_TITLE}>Task History</h2>
        <span className="text-xs text-ink3">outputs are kept in your output folder until you delete them</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm " aria-label="Filter by status">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={refresh} className={BTN_SECONDARY}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={async () => { try { await openOutputFolder(); } catch (e: any) { toast.push("error", e.message); } }} className={BTN_SECONDARY}>
            <FolderOutput size={14} /> Output folder
</button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm text-ink2`}>
          No tasks recorded yet.
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-line`}>
          {tasks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3.5">
              <StatusBadge status={t.status} />
              <span className="min-w-0 flex-1 basis-56 truncate text-sm font-medium text-ink" title={t.title}>
                {t.title}
              </span>
              <span className="rounded bg-elev px-1.5 py-0.5 text-[11px] text-ink2">
                {KIND_LABELS[t.kind] || t.kind}
              </span>
              <span className="text-xs text-ink3">
                {formatTimestamp(t.created_at)}
              </span>
              <span className="min-w-16 text-right text-xs text-ink2">
                {t.result?.outputs?.[0]?.size ? humanSize(t.result.outputs[0].size) : ""}
              </span>
              <span className="flex items-center gap-1.5">
                {t.result?.outputs?.[0] && (
                  <a href={downloadUrl(t.result.outputs[0].path)} download
className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-elev">
                    Download
</a>
                )}
                {t.status === "running" || t.status === "queued" ? (
                  <span className="text-xs text-acc">{t.stage}</span>
                ) : (
                  <button onClick={() => remove(t.id)} className="rounded-lg p-1.5 text-ink3 hover:bg-bad/10 hover:text-bad" aria-label="Remove from history" title="Remove from history">
                    <Trash2 size={14} />
                  </button>
                )}
              </span>
              {t.status === "failed" && t.error && (
                <p className="w-full truncate text-xs text-bad" title={t.error}>{t.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
