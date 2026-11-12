import { Combine, FileOutput, FilePlus2, FileStack, Images, Scissors, Video, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadUrl, listTasks, systemInfo } from "../api";
import { useToast } from "../ctx";
import { copyText, middleTruncate } from "../format";
import { SystemInfo, TaskRecord, humanSize } from "../types";
import { StatusBadge } from "../components/TaskPanel";
import ToolCard from "../components/ToolCard";
import EventLogPanel from "../components/EventLogPanel";
import { CARD, DOT, SECTION_LABEL } from "../ui";
import { EmptyState } from "../components/primitives";

const TOOLS = [
  { id: "merge", icon: Combine, title: "merge pdfs", desc: "Combine multiple PDFs in any order." },
  {
    id: "images",
    icon: Images,
    title: "images to pdf",
    desc: "Turn photos into one PDF with page sizes, margins and rotation.",
  },
  { id: "organize", icon: FileStack, title: "organize pages", desc: "Visually reorder, rotate and delete pages." },
  { id: "split", icon: Scissors, title: "split / extract", desc: "Extract page ranges or split every N pages." },
  { id: "compress", icon: Zap, title: "compress pdf", desc: "Shrink file size while balancing quality." },
  { id: "extract", icon: FilePlus2, title: "extract images", desc: "Export the embedded images from a PDF." },
  { id: "toimages", icon: FileOutput, title: "pdf to images", desc: "Render pages to PNG or JPG at any DPI." },
  { id: "media", icon: Video, title: "media downloader", desc: "Download video/audio via yt-dlp + FFmpeg." },
] as const;

type EngineState = "loading" | "ok" | "missing";

/** One compact line per dependency. A missing one turns into a warning row
 *  with a one-click path to Settings -> diagnostics. */
function EngineRow({ name, detail, state }: { name: string; detail: string; state: EngineState }) {
  if (state === "missing") {
    return (
      <li className="flex items-center gap-2 font-mono text-[0.75rem]">
        <span className={`${DOT} bg-warn`} aria-hidden />
        <span className="text-warn">{name}</span>
        <span className="truncate text-ink3" title={detail}>
          {detail}
        </span>
        <a
          href="#/settings?section=diagnostics"
          className="ml-auto shrink-0 rounded-sm text-warn underline decoration-dotted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          how to fix
        </a>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 font-mono text-[0.75rem]">
      <span className={`${DOT} ${state === "ok" ? "bg-ok" : "bg-ink3"}`} aria-hidden />
      <span className="text-ink">{name}</span>
      <span className="ml-auto truncate text-ink3" title={detail}>
        {detail}
      </span>
    </li>
  );
}

/** Counters are computed from the most recent tasks only, so say so. */
const RECENT_LIMIT = 50;

const engine = (found: boolean | undefined): EngineState =>
  found === undefined ? "loading" : found ? "ok" : "missing";

/** A recent operation. Finished work with a file opens (downloads) it; anything
 *  else - failed, running, or output gone - opens History narrowed to that task. */
function RecentRow({ t }: { t: TaskRecord }) {
  const out = t.result?.outputs?.[0];
  const canOpen = !!out && out.exists !== false;
  const inner = (
    <>
      <StatusBadge status={t.status} />
      <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-ink2 group-hover:text-ink" title={t.title}>
        {t.title}
      </span>
      <span className="shrink-0 font-mono text-[0.6875rem] text-ink3">
        {t.finished_at ? new Date(t.finished_at).toLocaleTimeString() : ""}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[0.6875rem] text-ink3">
        {out?.size ? humanSize(out.size) : ""}
      </span>
    </>
  );
  const cls =
    "group -mx-2 flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-elev/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc";
  return (
    <li>
      {canOpen ? (
        <a href={downloadUrl(out!.path)} download className={cls} title={`Download ${out!.name}`}>
          {inner}
        </a>
      ) : (
        <a href={`#/history?task=${encodeURIComponent(t.id)}`} className={cls} title="Show in history">
          {inner}
        </a>
      )}
    </li>
  );
}

export default function Dashboard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [recent, setRecent] = useState<TaskRecord[]>([]);
  const toast = useToast();

  useEffect(() => {
    systemInfo()
      .then(setInfo)
      .catch(() => {});
    listTasks(RECENT_LIMIT)
      .then(setRecent)
      .catch(() => {});
    // keep the console alive while it is on screen: the task list is a
    // cheap local read; engine info stays fetch-once (it spawns probes)
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        listTasks(RECENT_LIMIT)
          .then(setRecent)
          .catch(() => {});
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const count = (status: string) => recent.filter((t) => t.status === status).length;
  const active = recent.filter((t) => t.status === "running" || t.status === "queued").length;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* hero - genuine application data only */}
      <section className={`${CARD} col-span-12 p-5 lg:col-span-7`}>
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
          {info?.output_dir && (
            <button
              onClick={async () => {
                const ok = await copyText(info.output_dir);
                toast.push(
                  ok ? "success" : "error",
                  ok ? "Output folder path copied." : "Could not access the clipboard.",
                );
              }}
              title={`${info.output_dir} (click to copy)`}
              className="ml-auto hidden max-w-[16rem] truncate rounded-sm hover:text-ink2 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:block"
            >
              {middleTruncate(info.output_dir, 30)}
            </button>
          )}
        </div>
        <h2 className="mt-3 font-mono text-lg font-semibold tracking-tight text-ink">
          Your private PDF &amp; media toolbox
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink2">
          Everything runs on this machine as a localhost service - merge, convert, organize and compress PDFs, turn
          images into documents, and download media with yt-dlp and FFmpeg. Original files are always preserved.
        </p>
      </section>

      {/* engines: one compact line per dependency */}
      <section aria-label="System status" className={`${CARD} col-span-12 p-4 lg:col-span-5`}>
        <h3 className={`${SECTION_LABEL} mb-2.5 text-accText`}>engines</h3>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <EngineRow name="PyMuPDF" detail={info?.deps.pymupdf ?? "…"} state={info ? "ok" : "loading"} />
          <EngineRow
            name="FFmpeg"
            detail={info ? (info.deps.ffmpeg.found ? info.deps.ffmpeg.version.split(" ")[0] : "not found") : "…"}
            state={engine(info?.deps.ffmpeg.found)}
          />
          <EngineRow name="pypdf" detail={info?.deps.pypdf ?? "…"} state={info ? "ok" : "loading"} />
          <EngineRow
            name="ffprobe"
            detail={info ? (info.deps.ffprobe.found ? "detected" : "not found") : "…"}
            state={engine(info?.deps.ffprobe.found)}
          />
          <EngineRow name="Pillow" detail={info?.deps.pillow ?? "…"} state={info ? "ok" : "loading"} />
          <EngineRow
            name="yt-dlp"
            detail={info ? (info.deps.ytdlp.found ? info.deps.ytdlp.version : "not found") : "…"}
            state={engine(info?.deps.ytdlp.found)}
          />
        </ul>
      </section>

      {/* tools: 8 tools in a balanced 4 x 2 grid */}
      <section className="col-span-12">
        <h3 className={`${SECTION_LABEL} mb-2`}>quick actions</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t) => (
            <ToolCard key={t.id} {...t} />
          ))}
        </div>
      </section>

      {/* recent operations + event log, side by side from 1280px */}
      <section className="col-span-12 xl:col-span-7">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className={SECTION_LABEL}>recent operations</h3>
          <p
            className="flex flex-wrap items-center gap-x-3 font-mono text-[0.6875rem] text-ink3"
            aria-label={`Task counts for the last ${RECENT_LIMIT} tasks`}
          >
            <span>last {RECENT_LIMIT}:</span>
            <span>
              <span className="text-info">{active}</span> active
            </span>
            <span>
              <span className="text-accText">{count("completed")}</span> completed
            </span>
            <span>
              <span className={count("failed") ? "text-bad" : ""}>{count("failed")}</span> failed
            </span>
            <span>{count("cancelled")} cancelled</span>
          </p>
        </div>
        <div className={`${CARD} p-4`}>
          {recent.length === 0 ? (
            <EmptyState bare>no tasks yet - run a tool to get started</EmptyState>
          ) : (
            <ul className="space-y-2">
              {recent.slice(0, 8).map((t) => (
                <RecentRow key={t.id} t={t} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* session event log - real frontend-observed events only */}
      <section className="col-span-12 xl:col-span-5">
        <h3 className={`${SECTION_LABEL} mb-2`}>session</h3>
        <EventLogPanel defaultOpen />
      </section>

      <p className="col-span-12 text-xs text-ink3">
        Only download media you have permission to save. This app does not bypass DRM or access controls.
      </p>
    </div>
  );
}
