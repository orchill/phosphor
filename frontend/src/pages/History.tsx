import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOutput, RefreshCw, Scissors, Trash2 } from "lucide-react";
import { StatusBadge } from "../components/TaskPanel";
import { deleteTask, downloadUrl, listTasks, openOutputFolder } from "../api";
import { useNav, useToast } from "../ctx";
import { TaskRecord, TaskStatus, humanSize } from "../types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, SECTION_LABEL } from "../ui";
import { EmptyState, PageHeader, Tabs } from "../components/primitives";
import { useHashQuery } from "../hooks";

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
const FILTERS: (TaskStatus | "all")[] = [
  "all", "completed", "failed", "cancelled", "running",
];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unknown";
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "today";
  if (same(d, yesterday)) return "yesterday";
  return d.toLocaleDateString();
}

export default function History() {
  const { navigate } = useNav();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const focusTask = useHashQuery().get("task");

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

  // "#/history?task=<id>" (linked from the dashboard) narrows the list to one task
  const visible = useMemo(
    () => (focusTask ? tasks.filter((t) => t.id === focusTask) : tasks),
    [tasks, focusTask],
  );

  // group chronologically (list arrives newest-first)
  const groups = useMemo(() => {
    const out: { day: string; items: TaskRecord[] }[] = [];
    for (const t of visible) {
      const day = dayLabel(t.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(t);
      else out.push({ day, items: [t] });
    }
    return out;
  }, [visible]);

  return (
    <div className="space-y-4">
      <PageHeader
        route="history"
        description="Outputs are kept in your output folder until you delete them."
        actions={<>
          <button onClick={refresh} className={BTN_SECONDARY}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> refresh
          </button>
          <button onClick={async () => { try { await openOutputFolder(); } catch (e: any) { toast.push("error", e.message); } }} className={BTN_SECONDARY}>
            <FolderOutput size={14} /> output folder
          </button>
        </>}
      />

      {/* status filter chips */}
      <Tabs
        semantics="radio"
        label="Filter by status"
        value={status}
        onChange={setStatus}
        options={FILTERS.map((f) => ({
          id: f,
          label: f,
          dot: f === "all" ? undefined
            : f === "completed" ? "bg-ok" : f === "failed" ? "bg-bad"
            : f === "running" ? "bg-info" : f === "cancelled" ? "bg-ink3" : "bg-warn",
        }))}
      />

      {focusTask && (
        <p className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] text-ink3">
          showing task #{focusTask.slice(0, 8)}
          <button
            onClick={() => { window.location.hash = "#/history"; }}
            className="rounded-sm text-accText underline decoration-dotted hover:text-accHi focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            show all
          </button>
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          action={status === "all" ? (
            <button onClick={() => navigate("merge")} className={BTN_PRIMARY}>
              <Scissors size={15} aria-hidden /> run your first merge
            </button>
          ) : undefined}
        >
          {status === "all" ? "no tasks yet - run a tool to get started" : `no ${status} tasks`}
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <h3 className={`${SECTION_LABEL} mb-2 flex items-center gap-2`}>
              {g.day}
              <span className="h-px flex-1 bg-line" aria-hidden />
              <span className="text-ink3">{g.items.length}</span>
            </h3>
            <div className={`${CARD} divide-y divide-line`}>
              {g.items.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3.5">
                  <StatusBadge status={t.status} />
                  <span className="min-w-0 flex-1 basis-56 truncate font-mono text-[13px] font-medium text-ink" title={t.title}>
                    {t.title}
                  </span>
                  <span className="rounded-sm bg-elev px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink2">
                    {KIND_LABELS[t.kind] || t.kind}
                  </span>
                  <span className="font-mono text-[0.6875rem] text-ink3">
                    {formatTimestamp(t.created_at)}
                  </span>
                  <span className="min-w-16 text-right font-mono text-[0.6875rem] text-ink2">
                    {t.result?.outputs?.[0]?.size ? humanSize(t.result.outputs[0].size) : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {t.result?.outputs?.[0] && (
                      t.result.outputs[0].exists === false ? (
                        <span className="rounded-sm border border-line px-2 py-1 font-mono text-[0.6875rem] text-ink3"
                          title="The file was moved or deleted from the output folder">
                          file missing
                        </span>
                      ) : (
                        <a href={downloadUrl(t.result.outputs[0].path)} download
                          className={`${BTN_SECONDARY} px-2.5 py-1 text-xs`}>
                          download
                        </a>
                      )
                    )}
                    {t.status === "running" || t.status === "queued" ? (
                      <span className="font-mono text-[0.6875rem] text-accText">{t.stage}</span>
                    ) : (
                      <button onClick={() => remove(t.id)} className="rounded-sm p-1.5 text-ink3 hover:bg-bad/10 hover:text-bad focus:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label="Remove from history" title="Remove from history">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </span>
                  {t.status === "failed" && t.error && (
                    <p className="w-full truncate font-mono text-[0.6875rem] text-bad" title={t.error}>{t.error}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
