import {
  Combine, FileOutput, FilePlus2, FileStack, Images, Scissors,
  Video, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { listTasks, systemInfo } from "../api";
import { SystemInfo, TaskRecord, humanSize } from "../types";
import { StatusBadge } from "../components/TaskPanel";
import ToolCard from "../components/ToolCard";
import EventLogPanel from "../components/EventLogPanel";
import { CARD, DOT, SECTION_LABEL } from "../ui";

const TOOLS = [
  { id: "merge", icon: Combine, title: "merge pdfs", desc: "Combine multiple PDFs in any order." },
  { id: "images", icon: Images, title: "images to pdf", desc: "Turn photos into one PDF with page sizes, margins and rotation." },
  { id: "organize", icon: FileStack, title: "organize pages", desc: "Visually reorder, rotate and delete pages." },
  { id: "split", icon: Scissors, title: "split / extract", desc: "Extract page ranges or split every N pages." },
  { id: "compress", icon: Zap, title: "compress pdf", desc: "Shrink file size while balancing quality." },
  { id: "extract", icon: FilePlus2, title: "extract images", desc: "Export the embedded images from a PDF." },
  { id: "toimages", icon: FileOutput, title: "pdf to images", desc: "Render pages to PNG or JPG at any DPI." },
  { id: "media", icon: Video, title: "media downloader", desc: "Download video/audio via yt-dlp + FFmpeg." },
] as const;

function EngineRow({ name, detail, ok }: { name: string; detail: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2 font-mono text-[0.75rem]">
      <span className={`${DOT} ${ok ? "bg-ok" : "bg-bad"}`} aria-hidden />
      <span className="text-ink">{name}</span>
      <span className="ml-auto truncate text-ink3" title={detail}>{detail}</span>
    </li>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 font-mono text-[0.75rem]">
      <span className="flex items-center gap-2">
        <span className={`${DOT} ${tone}`} aria-hidden />
        <span className="text-ink2">{label}</span>
      </span>
      <span className="text-[0.9375rem] font-semibold text-ink">{value}</span>
    </div>
  );
}

/** Counters are computed from the most recent tasks only, so say so. */
const RECENT_LIMIT = 50;

export default function Dashboard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [recent, setRecent] = useState<TaskRecord[]>([]);

  useEffect(() => {
    systemInfo().then(setInfo).catch(() => {});
    listTasks(RECENT_LIMIT).then(setRecent).catch(() => {});
    // keep the console alive while it is on screen: the task list is a
    // cheap local read; engine info stays fetch-once (it spawns probes)
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        listTasks(RECENT_LIMIT).then(setRecent).catch(() => {});
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const count = (status: string) => recent.filter((t) => t.status === status).length;
  const active = recent.filter((t) => t.status === "running" || t.status === "queued").length;

  return (
    <div className="space-y-6">
      {/* status strip - genuine application data only */}
      <section className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] tracking-tight text-ink3">
          <span className={`${DOT} bg-ok`} aria-hidden />
          <span>ready</span>
          <span aria-hidden>·</span>
          <span>100% local</span>
          <span aria-hidden>·</span>
          <span>no cloud</span>
          {info?.app_version && (
            <>
              <span aria-hidden>·</span>
              <span>v{info.app_version}</span>
            </>
          )}
          {info?.free_disk_gb != null && (
            <>
              <span aria-hidden>·</span>
              <span>{info.free_disk_gb} GB free</span>
            </>
          )}
          <span className="ml-auto hidden sm:block">~/.local/pdf-media-studio</span>
        </div>
        <h2 className="mt-3 font-mono text-lg font-semibold tracking-tight text-ink">
          Your private PDF &amp; media toolbox<span className="animate-cursor-blink text-accText" aria-hidden>▮</span>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink2">
          Everything runs on this machine as a localhost service - merge, convert, organize
          and compress PDFs, turn images into documents, and download media with yt-dlp and
          FFmpeg. Original files are always preserved.
        </p>
      </section>

      {/* engines + task counters */}
      <section aria-label="System status">
        <h3 className={`${SECTION_LABEL} mb-2`}>system</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className={`${CARD} p-4`}>
            <h4 className={`${SECTION_LABEL} mb-2.5 text-accText`}>pdf engine</h4>
            <ul className="space-y-1.5">
              <EngineRow name="PyMuPDF" detail={info?.deps.pymupdf ?? "…"} ok={!!info} />
              <EngineRow name="pypdf" detail={info?.deps.pypdf ?? "…"} ok={!!info} />
              <EngineRow name="Pillow" detail={info?.deps.pillow ?? "…"} ok={!!info} />
            </ul>
          </div>
          <div className={`${CARD} p-4`}>
            <h4 className={`${SECTION_LABEL} mb-2.5 text-accText`}>media engine</h4>
            <ul className="space-y-1.5">
              <EngineRow
                name="FFmpeg"
                detail={info ? (info.deps.ffmpeg.found ? info.deps.ffmpeg.version.split(" ")[0] : "install required") : "…"}
                ok={info ? info.deps.ffmpeg.found : false}
              />
              <EngineRow
                name="ffprobe"
                detail={info ? (info.deps.ffprobe.found ? "detected" : "not found") : "…"}
                ok={info ? info.deps.ffprobe.found : false}
              />
              <EngineRow
                name="yt-dlp"
                detail={info ? info.deps.ytdlp.version : "…"}
                ok={info ? info.deps.ytdlp.found : false}
              />
            </ul>
          </div>
          <div className={`${CARD} p-4`}>
            <h4 className={`${SECTION_LABEL} mb-2.5 text-accText`}>
              tasks <span className="text-ink3">· last {RECENT_LIMIT}</span>
            </h4>
            <div className="space-y-2">
              <Counter label="active" value={active} tone={active ? "bg-info" : "bg-ink3"} />
              <Counter label="completed" value={count("completed")} tone="bg-ok" />
              <Counter label="failed" value={count("failed")} tone={count("failed") ? "bg-bad" : "bg-ink3"} />
              <Counter label="cancelled" value={count("cancelled")} tone="bg-ink3" />
            </div>
          </div>
        </div>
      </section>

      {/* quick actions */}
      <section>
        <h3 className={`${SECTION_LABEL} mb-2`}>quick actions</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <ToolCard key={t.id} {...t} />
          ))}
        </div>
      </section>

      {/* recent operations */}
      <section>
        <h3 className={`${SECTION_LABEL} mb-2`}>recent operations</h3>
        <div className={`${CARD} p-4`}>
          {recent.length === 0 ? (
            <p className="text-sm text-ink3">No operations yet - results and downloads will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {recent.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <StatusBadge status={t.status} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-ink2" title={t.title}>{t.title}</span>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-ink3">
                    {t.finished_at ? new Date(t.finished_at).toLocaleTimeString() : ""}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-[0.6875rem] text-ink3">
                    {t.result?.outputs?.[0]?.size ? humanSize(t.result.outputs[0].size) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* session event log - real frontend-observed events only */}
      <EventLogPanel />

      <p className="text-xs text-ink3">
        Only download media you have permission to save. This app does not bypass DRM or access controls.
      </p>
    </div>
  );
}
