import { useEffect, useState } from "react";
import { CheckCircle2, FolderOutput, RefreshCw, Save, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { clearWorkspace, getSettings, openOutputFolder, saveSettings, systemInfo } from "../api";
import { useToast } from "../ctx";
import { Settings, SystemInfo } from "../types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL, SECTION_TITLE } from "../ui";

function DepRow({ name, found, detail, hint }: { name: string; found: boolean; detail: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5">
      {found ? <CheckCircle2 size={15} className="text-ok" /> : <XCircle size={15} className="text-bad" />}
      <span className="font-mono text-[13px] font-medium text-ink">{name}</span>
      <span className={`truncate font-mono text-[11px] ${found ? "text-ink3" : "text-bad"}`}>{detail}</span>
      {!found && hint && <span className="w-full text-xs text-ink3">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${CARD} space-y-4 p-4`}>
      <h3 className={`${SECTION_TITLE} text-acc`}>{title}</h3>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [cfg, setCfg] = useState<Settings | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const loadAll = async () => {
    try {
      setCfg(await getSettings());
      setInfo(await systemInfo());
    } catch (e: any) {
      toast.push("error", e.message);
    }
  };
  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Settings, v: any) => setCfg((c) => (c ? { ...c, [k]: v } : c));
  const setNum = (k: keyof Settings, v: string) => {
    const n = Number(v);
    if (Number.isFinite(n)) set(k, n);
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const { restart_required } = await saveSettings({
        output_dir: cfg.output_dir,
        ffmpeg_path: cfg.ffmpeg_path,
        ytdlp_path: cfg.ytdlp_path,
        host: cfg.host,
        port: cfg.port,
        max_upload_mb: cfg.max_upload_mb,
        max_download_gb: cfg.max_download_gb,
        max_duration_hours: cfg.max_duration_hours,
        max_concurrent_tasks: cfg.max_concurrent_tasks,
        history_limit: cfg.history_limit,
        open_browser: cfg.open_browser,
      });
      toast.push("success",
        "Settings saved." +
        (restart_required.length
          ? ` Restart required for: ${restart_required.join(", ")} - restart the app to apply.`
          : ""));
      setInfo(await systemInfo());
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return <p className="text-sm text-ink2">Loading settings...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="general">
            <div>
              <label className={LABEL} htmlFor="outdir">Output directory (processed files are saved here)</label>
              <input id="outdir" value={cfg.output_dir} onChange={(e) => set("output_dir", e.target.value)} className={`${INPUT} mt-1 text-xs`} />
            </div>
            <div>
              <label className={LABEL} htmlFor="hist">Task history entries kept on disk (5-1000)</label>
              <input id="hist" type="number" min={5} max={1000} value={cfg.history_limit}
                onChange={(e) => setNum("history_limit", e.target.value)} className={`${INPUT} mt-1 w-36`} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={cfg.open_browser} onChange={(e) => set("open_browser", e.target.checked)} className="accent-acc" />
              Open the web interface automatically on startup
            </label>
          </Section>

          <Section title="network">
            <p className="-mt-2 text-xs text-ink3">
              Requires an application restart. Keep the loopback address unless you
              understand the risk of exposing the app to your network.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL} htmlFor="host">Host (restart required)</label>
                <select id="host" value={cfg.host} onChange={(e) => set("host", e.target.value)} className={`${INPUT} mt-1`}>
                  <option value="127.0.0.1">127.0.0.1 (localhost only - safe)</option>
                  <option value="localhost">localhost</option>
                  <option value="0.0.0.0">0.0.0.0 (all interfaces - LAN exposed)</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="port">Port (restart required)</label>
                <input id="port" type="number" min={1} max={65535} value={cfg.port}
                  onChange={(e) => setNum("port", e.target.value)} className={`${INPUT} mt-1`} />
              </div>
            </div>
          </Section>

          <Section title="downloads">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL} htmlFor="upl">Max upload (MB)</label>
                <input id="upl" type="number" min={1} value={cfg.max_upload_mb}
                  onChange={(e) => setNum("max_upload_mb", e.target.value)} className={`${INPUT} mt-1`} />
              </div>
              <div>
                <label className={LABEL} htmlFor="dlgb">Max download (GB, 0 = no cap)</label>
                <input id="dlgb" type="number" min={0} value={cfg.max_download_gb}
                  onChange={(e) => setNum("max_download_gb", e.target.value)} className={`${INPUT} mt-1`} />
              </div>
              <div>
                <label className={LABEL} htmlFor="dur">Max duration (h, 0 = no cap)</label>
                <input id="dur" type="number" min={0} value={cfg.max_duration_hours}
                  onChange={(e) => setNum("max_duration_hours", e.target.value)} className={`${INPUT} mt-1`} />
              </div>
              <div>
                <label className={LABEL} htmlFor="conc">Parallel tasks (1-8)</label>
                <input id="conc" type="number" min={1} max={8} value={cfg.max_concurrent_tasks}
                  onChange={(e) => setNum("max_concurrent_tasks", e.target.value)} className={`${INPUT} mt-1`} />
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="tools">
            <div>
              <label className={LABEL} htmlFor="ffmpeg">FFmpeg path (empty = auto-detect)</label>
              <input id="ffmpeg" value={cfg.ffmpeg_path} onChange={(e) => set("ffmpeg_path", e.target.value)}
                placeholder="C:\ffmpeg\bin\ffmpeg.exe or /usr/bin/ffmpeg" className={`${INPUT} mt-1 text-xs`} />
            </div>
            <div>
              <label className={LABEL} htmlFor="ytdlp">yt-dlp path (empty = built-in Python module)</label>
              <input id="ytdlp" value={cfg.ytdlp_path} onChange={(e) => set("ytdlp_path", e.target.value)}
                placeholder="C:\tools\yt-dlp.exe" className={`${INPUT} mt-1 text-xs`} />
            </div>
          </Section>

          <div className={`${CARD} p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className={SECTION_TITLE}>diagnostics</h3>
              <button onClick={loadAll} className={`${BTN_SECONDARY} ml-auto py-1 text-xs`}><RefreshCw size={12} /> Re-check</button>
            </div>
            {info && (
              <div className="divide-y divide-line">
                <DepRow name="FFmpeg" found={info.deps.ffmpeg.found}
                  detail={info.deps.ffmpeg.found ? `${info.deps.ffmpeg.version} (${info.deps.ffmpeg.path})` : "not found"}
                  hint="Install: winget install Gyan.FFmpeg (Windows) or apt install ffmpeg (Linux), then restart the app - or set the path above." />
                <DepRow name="yt-dlp" found={info.deps.ytdlp.found} detail={`${info.deps.ytdlp.version} (${info.deps.ytdlp.source})`} />
                <DepRow name="PyMuPDF" found detail={info.deps.pymupdf} />
                <DepRow name="pypdf" found detail={info.deps.pypdf} />
                <DepRow name="Pillow" found detail={info.deps.pillow} />
                <p className="pt-2 font-mono text-[11px] text-ink3">
                  app {info.app_version} - python {info.python} - {info.platform}
                  {info.free_disk_gb != null && <> - {info.free_disk_gb} GB free</>}
                </p>
              </div>
            )}
          </div>

          <div className={`${CARD} border-warn/50 p-4`}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-warn">
              <ShieldAlert size={15} /> Privacy &amp; security notes
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink2">
              <li>Default binding is 127.0.0.1 - other devices cannot reach the app. Switching
                the host above exposes it to your network; cross-site requests are blocked by
                the built-in CSRF/Origin protection either way.</li>
              <li>URLs pointing at private/loopback addresses are rejected to prevent SSRF.</li>
              <li>Downloads are limited in size and duration (Downloads section).</li>
              <li>Cached uploads are wiped on every restart; outputs stay in the output folder.</li>
              <li>YouTube cookies (Cookies / Sign-in tab in the downloader) are stored only in
                <code className="mx-1 font-mono">data/cookies.txt</code>, never logged and never shown.</li>
              <li>No telemetry, no cloud services - files never leave this machine.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-line bg-base/95 px-1 py-3 backdrop-blur">
        <button onClick={save} disabled={saving} className={BTN_PRIMARY}><Save size={15} /> Save settings</button>
        <button onClick={async () => { try { await openOutputFolder(); } catch (e: any) { toast.push("error", e.message); } }} className={BTN_SECONDARY}>
          <FolderOutput size={15} /> Open output folder
        </button>
        <button
          onClick={async () => {
            if (!confirm("Clear all cached uploads and thumbnails? Files in the output folder are NOT touched.")) return;
            try { const r = await clearWorkspace(); toast.push("success", `Cleared ${r.removed} items.`); }
            catch (e: any) { toast.push("error", e.message); }
          }}
          className={BTN_SECONDARY}
        >
          <Trash2 size={15} /> Clear workspace cache
        </button>
      </div>
    </div>
  );
}
