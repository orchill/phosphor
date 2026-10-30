import {
  Combine, FileOutput, FilePlus2, FileStack, Images, Scissors,
  Video, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { listTasks, systemInfo } from "../api";
import { SystemInfo, TaskRecord, humanSize } from "../types";
import { StatusBadge } from "../components/TaskPanel";
import ToolCard from "../components/ToolCard";
import { CARD, DOT, SECTION_TITLE } from "../ui";

const TOOLS = [
  { id: "merge", icon: Combine, title: "Merge PDFs", desc: "Combine multiple PDFs in any order." },
  { id: "images", icon: Images, title: "Images to PDF", desc: "Turn photos into one PDF with page sizes, margins and rotation." },
  { id: "organize", icon: FileStack, title: "Organize Pages", desc: "Visually reorder, rotate and delete pages." },
  { id: "split", icon: Scissors, title: "Split / Extract", desc: "Extract page ranges or split every N pages." },
  { id: "compress", icon: Zap, title: "Compress PDF", desc: "Shrink file size while balancing quality." },
  { id: "extract", icon: FilePlus2, title: "Extract Images", desc: "Export the embedded images from a PDF." },
  { id: "toimages", icon: FileOutput, title: "PDF to Images", desc: "Render pages to PNG or JPG at any DPI." },
  { id: "media", icon: Video, title: "Media Downloader", desc: "Download video/audio via yt-dlp + FFmpeg." },
] as const;

function DepsCard({ info }: { info: SystemInfo | null }) {
  if (!info) return null;
  const d = info.deps;
  const items = [
    { name: "FFmpeg", ok: d.ffmpeg.found, detail: d.ffmpeg.found ? d.ffmpeg.version.split(" ")[0] : "install required" },
    { name: "yt-dlp", ok: d.ytdlp.found, detail: d.ytdlp.version },
    { name: "PyMuPDF", ok: true, detail: d.pymupdf },
    { name: "pypdf", ok: true, detail: d.pypdf },
    { name: "Pillow", ok: true, detail: d.pillow },
  ];
  return (
    <div className={`${CARD} p-4`}>
      <h2 className={`${SECTION_TITLE} mb-3`}>system status</h2>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.name} className="flex items-center gap-2 font-mono text-[12px]">
            <span className={`${DOT} ${it.ok ? "bg-ok" : "bg-bad"}`} aria-hidden />
            <span className="text-ink">{it.name}</span>
            <span className="ml-auto truncate text-ink3">{it.detail}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 border-t border-line pt-2 font-mono text-[11px] text-ink3">
          <span className="shrink-0">output:</span>
          <span className="truncate">{info.output_dir}</span>
        </li>
        {info.free_disk_gb != null && (
          <li className="font-mono text-[11px] text-ink3">free disk: {info.free_disk_gb} GB</li>
        )}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [recent, setRecent] = useState<TaskRecord[]>([]);

  useEffect(() => {
    systemInfo().then(setInfo).catch(() => {});
    listTasks(6).then(setRecent).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <section className={`${CARD} p-5`}>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-tight text-ink3">
          <span className={`${DOT} bg-ok`} aria-hidden />
          <span>ready</span>
          <span aria-hidden>·</span>
          <span>100% local</span>
          <span aria-hidden>·</span>
          <span>no cloud</span>
          <span className="ml-auto hidden sm:block">~/.local/pdf-media-studio</span>
        </div>
        <h2 className="mt-3 font-mono text-lg font-semibold tracking-tight text-ink">
          Your private PDF &amp; media toolbox<span className="animate-cursor-blink text-acc" aria-hidden>▮</span>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink2">
          Everything runs on this machine as a localhost service - merge, convert, organize
          and compress PDFs, turn images into documents, and download media with yt-dlp and
          FFmpeg. Original files are always preserved.
        </p>
      </section>

      <section>
        <h2 className={`${SECTION_TITLE} mb-3`}>tools</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <ToolCard key={t.id} {...t} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DepsCard info={info} />
        <div className={`${CARD} p-4`}>
          <h2 className={`${SECTION_TITLE} mb-3`}>recent tasks</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-ink3">No tasks yet - results and downloads will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <StatusBadge status={t.status} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink2">{t.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink3">
                    {t.result?.outputs?.[0]?.size ? humanSize(t.result.outputs[0].size) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-ink3">
        Only download media you have permission to save. This app does not bypass DRM or access controls.
      </p>
    </div>
  );
}
