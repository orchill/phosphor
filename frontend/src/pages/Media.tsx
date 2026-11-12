import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, Cookie, Download, KeyRound, Link2, Loader2, Music,
  ClipboardPaste, RefreshCw, Video,
} from "lucide-react";
import TaskPanel from "../components/TaskPanel";
import CookiesPanel from "../components/CookiesPanel";
import { getCookieStatus, mediaDownload, mediaInfo } from "../api";
import { useToast } from "../ctx";
import {
  CookieStatus, MediaFormat, MediaInfo, humanSize, fmtDuration,
} from "../types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from "../ui";
import { PageHeader, Tabs } from "../components/primitives";

const HEIGHTS: [number, string][] = [
  [0, "Best available"],
  [2160, "2160p (4K)"], [1440, "1440p"], [1080, "1080p"],
  [720, "720p"], [480, "480p"], [360, "360p"],
];

// Errors that usually mean "sign in with your own cookies". Word-bounded so
// "package", "storage" or "message" never trigger the banner.
/** Cheap shape check before auto-fetching a pasted value. */
const LOOKS_LIKE_URL = /^https?:\/\/\S+\.\S+/i;

const COOKIE_HINT = /\b(sign[- ]in|bot|age-restricted|confirm your age|cookies)\b/i;

function formatSize(f: MediaFormat | null | undefined): number | null {
  return f?.filesize ?? f?.filesize_approx ?? null;
}

export default function Media() {
  const [tab, setTab] = useState<"downloader" | "cookies">("downloader");
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [needCookies, setNeedCookies] = useState(false);
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [fetching, setFetching] = useState(false);
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [height, setHeight] = useState(0);
  const [preferH264, setPreferH264] = useState(true);
  const [videoFmt, setVideoFmt] = useState("");   // advanced: explicit format id
const [audioFmt, setAudioFmt] = useState("mp3");
  const [audioKbps, setAudioKbps] = useState<number | null>(192);
  const [starting, setStarting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const toast = useToast();

  const refreshCookies = (): Promise<CookieStatus> =>
    getCookieStatus().then((s) => {
      setCookieStatus(s);
      return s;
    });
  useEffect(() => { refreshCookies().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
// Stable ref so a debounced paste always calls the latest closure.
  const fetchRef = useRef<(u?: string) => void>(() => {});
  const pasteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pasteTimer.current) clearTimeout(pasteTimer.current); }, []);

  /** Pasted or Enter-submitted URLs fetch automatically; plain typing never does. */
  const schedulePasteFetch = (text: string) => {
    const t = text.trim();
    if (!LOOKS_LIKE_URL.test(t)) return;
    setUrl(t);
    if (pasteTimer.current) clearTimeout(pasteTimer.current);
    pasteTimer.current = setTimeout(() => fetchRef.current(t), 300);
  };

  const fetchInfo = async (override?: string) => {
    const target = (override ?? url).trim();
    if (!target) { toast.push("error", "Paste a video URL first."); return; }
    if (fetching) return;
    setFetching(true);
    setInfo(null);
    setTaskId(null);
    setNeedCookies(false);
    try {
      const data = await mediaInfo(target);
      setInfo(data);
      toast.push("success", `Found: ${data.title}`);
    } catch (e: any) {
      toast.push("error", e.message);
      if (COOKIE_HINT.test(String(e.message || ""))) setNeedCookies(true);
    } finally {
      setFetching(false);
    }
  };

  fetchRef.current = (u) => { void fetchInfo(u); };

  const lastDownload = useRef<import("../types").MediaDownloadPayload | null>(
    null,
  );

  const start = async () => {
    if (!info) return;
    setStarting(true);
    try {
      const payload = {
        url: info.webpage_url || url,
        mode,
        // Mode-specific fields only - a video selection must never leak into
// an audio download (the backend drops them defensively as well).
        ...(mode === "video"
          ? {
              video_format: "mp4",
              height: height || null,
              prefer_h264: preferH264,
              format_ids: videoFmt ? { video: videoFmt, audio: "" } : null,
            }
          : {
              audio_format: audioFmt,
              audio_quality: audioFmt !== "best" ? audioKbps : null,
            }),
        video_id: info.id,
        title: info.title,
        is_live: info.is_live,
      };
      lastDownload.current = payload;
      const { task_id } = await mediaDownload(payload);
      setTaskId(task_id);
      toast.push("info", "Download started.");
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setStarting(false);
    }
  };

  const bestAudio = info?.audio_formats?.[0];
  const selectedVideo = videoFmt
? info?.video_formats.find((f) => f.id === videoFmt)
    : null;
  const estSize =
    mode === "audio"
      ? audioFmt === "best" ? formatSize(bestAudio) : null
: formatSize(selectedVideo);

  return (
    <div className="space-y-4">
      <PageHeader
        route="media"
        description={<>
          Powered by yt-dlp + FFmpeg running locally. Paste a supported URL (YouTube and hundreds
of other sites). Only download content you have the right to save - DRM and access
controls are never bypassed. Hitting a bot check? Use the
<button onClick={() => setTab("cookies")} className="mx-1 font-medium text-accText underline decoration-dotted hover:text-accHi">
            cookies / sign-in
</button>
          tab.
        </>}
      />

      {needCookies && tab === "downloader" && (
        <div className={`${CARD} flex flex-col gap-2 border-warn/50 p-4 sm:flex-row sm:items-center `}>
          <div className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              YouTube is asking for verification. Signing in with your own cookies usually
fixes this - it takes about a minute.
            </span>
          </div>
          <button onClick={() => setTab("cookies")} className={`${BTN_SECONDARY} shrink-0 sm:ml-auto`}>
            <KeyRound size={15} /> open cookies / sign-in
</button>
        </div>
      )}

      {/* top-level tabs: Downloader | Cookies / Sign-in */}
      <Tabs
        label="Downloader sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "downloader", label: "downloader", icon: <Download size={14} aria-hidden /> },
          {
            id: "cookies",
            label: "cookies / sign-in",
            icon: <Cookie size={14} aria-hidden />,
            trailing: cookieStatus && cookieStatus.source !== "none"
              ? <span className="h-1.5 w-1.5 rounded-full bg-ok" title="Sign-in configured" /> : undefined,
          },
        ]}
      />

      {tab === "cookies" && (
        <CookiesPanel status={cookieStatus} refresh={refreshCookies} />
      )}

      {tab === "downloader" && (
        <>
      <div className={`${CARD} p-4`}>
        <label className={LABEL} htmlFor="mediaurl">video or audio url</label>
        <div className="mt-1 flex items-stretch">
          <div className="relative min-w-0 flex-1">
            <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              id="mediaurl" value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => schedulePasteFetch(e.clipboardData.getData("text"))}
              onKeyDown={(e) => { if (e.key === "Enter") fetchInfo(); }}
              placeholder="https://www.youtube.com/watch?v=..."
              className={`${INPUT} rounded-r-none pl-9`}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            onClick={() => navigator.clipboard?.readText().then(schedulePasteFetch).catch(() => {})}
            className={`${BTN_SECONDARY} rounded-none border-l-0`}
            aria-label="Paste URL from clipboard"
            title="Paste from clipboard"
          >
            <ClipboardPaste size={15} aria-hidden />
          </button>
          <button onClick={() => fetchInfo()} disabled={fetching} className={`${BTN_PRIMARY} rounded-l-none`}>
            {fetching ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            fetch info
          </button>
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-ink3">Paste a link or press Enter - details load automatically.</p>
      </div>

      {fetching && (
        <div className={`${CARD} flex items-center gap-3 p-6 text-sm text-ink2`}>
          <Loader2 size={16} className="animate-spin" /> Contacting the site and reading available formats...
        </div>
      )}

      {info && (
        <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
          <div className={`${CARD} overflow-hidden`}>
            <div className="relative aspect-video w-full bg-elev">
              <img
                src={info.thumbnail}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
              />
              <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-base/85 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-ink">
                {info.is_live ? "live" : fmtDuration(info.duration)}
              </span>
            </div>
            <div className="min-w-0 space-y-1 p-4">
              <h3 className="text-base font-semibold leading-snug text-ink">{info.title}</h3>
              <p className="text-sm text-ink2">
                {info.uploader && <>{info.uploader}</>}
                {info.extractor && <>{info.uploader ? " - " : ""}{info.extractor}</>}
              </p>
              <p className="text-xs text-ink3">
                {info.video_formats.length} video / {info.audio_formats.length} audio formats available
              </p>
            </div>
          </div>

          <div className={`${CARD} space-y-4 p-4`}>
            <Tabs
              label="Output type"
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === "audio") { setVideoFmt(""); setHeight(0); }
              }}
              options={[
                { id: "video", label: "video (mp4)", icon: <Video size={14} aria-hidden /> },
                { id: "audio", label: "audio (mp3 / m4a)", icon: <Music size={14} aria-hidden /> },
              ]}
            />

            {mode === "video" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL} htmlFor="res">Maximum resolution</label>
                  <select id="res" value={height} onChange={(e) => { setHeight(+e.target.value); setVideoFmt(""); }} className={`${INPUT} mt-1`} disabled={!!videoFmt}>
                    {HEIGHTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <details className="group rounded border border-line bg-base/50 sm:col-span-2">
                  <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-ink3 hover:text-ink2">
                    advanced options
                    <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="grid grid-cols-1 gap-4 border-t border-line p-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL} htmlFor="vfmt">Exact format (overrides resolution)</label>
                      <select id="vfmt" value={videoFmt} onChange={(e) => setVideoFmt(e.target.value)} className={`${INPUT} mt-1`}>
                        <option value="">Auto-select (recommended)</option>
                        {info.video_formats.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.id} - {f.height ? `${f.height}p` : "video"} {f.fps ? `${Math.round(f.fps)}fps` : ""} {f.ext} {formatSize(f) ? `(${humanSize(formatSize(f))})` : ""} {f.type === "video-only" ? "(no audio)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <p className={LABEL}>available formats</p>
                      <div className="mt-1.5 max-h-56 overflow-auto rounded border border-line bg-panel">
                        <table className="w-full border-collapse font-mono text-[0.6875rem]">
                          <thead>
                            <tr className="sticky top-0 z-10 bg-panel text-left text-[0.625rem] uppercase tracking-widest text-ink3 shadow-[0_1px_0_rgb(var(--c-line))]">
                              <th className="px-3 py-1.5 font-medium">id</th>
                              <th className="px-2 py-1.5 font-medium">ext</th>
                              <th className="px-2 py-1.5 font-medium">res</th>
                              <th className="px-2 py-1.5 font-medium">fps</th>
                              <th className="px-2 py-1.5 text-right font-medium">size</th>
                              <th className="px-3 py-1.5 font-medium">audio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {info.video_formats.map((f) => {
                              const selected = videoFmt === f.id;
                              return (
                                <tr
                                  key={f.id}
                                  onClick={() => setVideoFmt(selected ? "" : f.id)}
                                  aria-selected={selected}
                                  className={`cursor-pointer transition-colors ${
                                    selected ? "bg-acc/10 text-accText" : "text-ink2 hover:bg-elev/60"
                                  }`}
                                >
                                  <td className={`px-3 py-1.5 ${selected ? "font-semibold" : ""}`}>{f.id}</td>
                                  <td className="px-2 py-1.5">{f.ext}</td>
                                  <td className="px-2 py-1.5">{f.height ? `${f.height}p` : "-"}</td>
                                  <td className="px-2 py-1.5">{f.fps ? Math.round(f.fps) : "-"}</td>
                                  <td className="px-2 py-1.5 text-right">{formatSize(f) ? humanSize(formatSize(f)) : "-"}</td>
                                  <td className="px-3 py-1.5">{f.type === "video-only" ? "no" : "yes"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-1 text-[0.625rem] text-ink3">
                        Click a row to lock that exact format (syncs the selector above); click it again to release.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                      <input type="checkbox" checked={preferH264} onChange={(e) => setPreferH264(e.target.checked)} disabled={!!videoFmt} className="accent-acc" />
                      Prefer H.264/AAC for maximum player compatibility (falls back to any codec if unavailable)
                    </label>
                    {videoFmt && info.video_formats.find((f) => f.id === videoFmt)?.type === "video-only" && (
                      <p className="text-xs text-warn sm:col-span-2">
                        Selected format has no audio - the best audio stream will be merged in (requires FFmpeg).
                      </p>
                    )}
                  </div>
                </details>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL} htmlFor="afmt">Audio format</label>
                  <select id="afmt" value={audioFmt} onChange={(e) => setAudioFmt(e.target.value)} className={`${INPUT} mt-1`}>
                    <option value="mp3">MP3 (converted via FFmpeg)</option>
                    <option value="m4a">M4A / AAC (where available)</option>
                    <option value="best">Best available (no conversion)</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL} htmlFor="akbps">Bitrate</label>
                  <select id="akbps" value={audioKbps ?? ""} onChange={(e) => setAudioKbps(+e.target.value)} className={`${INPUT} mt-1`} disabled={audioFmt === "best"}>
                    {[320, 256, 192, 128, 96, 64].map((k) => <option key={k} value={k}>{k} kbps</option>)}
                  </select>
                </div>
                {bestAudio && (
                  <p className="text-xs text-ink2 sm:col-span-2">
                    Best source audio: {bestAudio.ext} {bestAudio.abr ? `${Math.round(bestAudio.abr)} kbps` : ""} {formatSize(bestAudio) ? `- about ${humanSize(formatSize(bestAudio))}` : ""}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 ">
              <button onClick={start} disabled={starting} className={BTN_PRIMARY}>
                {starting ? <Loader2 size={15} className="animate-spin" /> : <Download size={16} />}
                download {mode === "video" ? (videoFmt ? `format ${videoFmt}` : (height ? `${height}p` : "best")) : audioFmt}
              </button>
              {estSize ? (
                <span className="text-xs text-ink2">Estimated size: {humanSize(estSize)}</span>
              ) : (
                <span className="text-xs text-ink3">Size estimate unavailable for this selection</span>
              )}
            </div>
            <p className="border-t border-line pt-3 text-[0.6875rem] text-ink3">
              Respect copyright - download only content you have the right to save.
            </p>
          </div>
        </div>
      )}
        </>
      )}

      <TaskPanel
        taskId={taskId}
        onDismiss={() => setTaskId(null)}
        onRetry={lastDownload.current ? () => {
          if (!lastDownload.current) return;
          setStarting(true);
          mediaDownload(lastDownload.current)
            .then(({ task_id }) => setTaskId(task_id))
            .catch((e: any) => toast.push("error", e.message))
            .finally(() => setStarting(false));
        } : undefined}
      />
    </div>
  );
}
