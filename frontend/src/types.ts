export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface OutputFile {
  name: string;
  path: string;
  size: number;
  url: string;
}

export interface TaskRecord {
  id: string;
  kind: string;
  title: string;
  status: TaskStatus;
  progress: number | null;
  stage: string;
  message: string;
  error: string;
  result: { outputs?: OutputFile[]; info?: Record<string, any>; note?: string };
  log_tail: string[];
  meta: Record<string, any>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface UploadedFile {
  id: string;
  name: string;
  orig_name?: string;
  size: number;
  kind: "pdf" | "image";
  pages: number;
  format: string;
  width?: number;
  height?: number;
  ext?: string;
  uploaded_at?: string;
}

export interface MediaFormat {
  id: string;
  ext: string;
  type: "video+audio" | "video-only" | "audio-only";
  vcodec: string;
  acodec: string;
  height: number | null;
  width: number | null;
  fps: number | null;
  abr: number | null;
  vbr: number | null;
  tbr: number | null;
  filesize: number | null;
  filesize_approx: number | null;
  note: string;
}

export interface MediaInfo {
  id: string;
  title: string;
  uploader: string;
  duration: number | null;
  thumbnail: string;
  is_live: boolean;
  extractor: string;
  webpage_url: string;
  formats: MediaFormat[];
  video_formats: MediaFormat[];
  audio_formats: MediaFormat[];
}

export interface CookieStatus {
  source: "none" | "file" | "browser";
  browser: string;
  file_present: boolean;
  cookie_count: number;
  domains: string[];
  supported_browsers: string[];
}

export interface CookieTestResult {
  ok: boolean;
  message: string;
  elapsed_s?: number;
}

export interface SystemInfo {
  app: string;
  app_version: string;
  python: string;
  platform: string;
  output_dir: string;
  free_disk_gb: number | null;
  deps: {
    ffmpeg: { found: boolean; path: string; version: string };
    ffprobe: { found: boolean; path: string };
    ytdlp: { found: boolean; version: string; source: string };
    pymupdf: string;
    pypdf: string;
    pillow: string;
    fastapi: string;
  };
}

export type Settings = {
  host: string;
  port: number;
  output_dir: string;
  ffmpeg_path: string;
  ytdlp_path: string;
  max_upload_mb: number;
  max_download_gb: number;
  max_duration_hours: number;
  max_concurrent_tasks: number;
  history_limit: number;
  open_browser: boolean;
};

// ------------------------------------------------- API request payloads
// Mirror the FastAPI request schemas (backend/app/routers/{pdf,media}.py).

/** POST /api/pdf/merge */
export interface MergePayload {
  file_ids: string[];
  output_name?: string | null;
}

/** POST /api/pdf/images-to-pdf */
export interface ImagesToPdfPayload {
  items: { id: string; rotation: number }[];
  page_size: string;                       // a4 | a3 | a5 | letter | legal | image
  orientation: string;                     // auto | portrait | landscape
  margin_mm: number;
  image_dpi: number;
  jpeg_quality: number | null;             // null = preserve original bytes
  output_name?: string | null;
}

/** POST /api/pdf/pages */
export interface EditPagesPayload {
  file_id: string;
  order: number[];
  rotate: Record<string, number>;          // page number (as string) -> degrees
  output_name?: string | null;
}

/** POST /api/pdf/split */
export interface SplitPayload {
  file_id: string;
  mode: "extract" | "ranges" | "every_n";
  ranges?: string | null;                  // mode=ranges: "1-3,5,8-10"
  every_n?: number | null;                 // mode=every_n
  pages?: string | null;                   // mode=extract: "1,2,5-8" (empty = all)
  output_name?: string | null;
}

/** POST /api/pdf/compress */
export interface CompressPayload {
  file_id: string;
  quality: number;                         // 10-95
  dpi_cap: number;                         // 36-300
}

/** POST /api/pdf/extract-images */
export interface SimpleOpPayload {
  file_id: string;
}

/** POST /api/pdf/to-images */
export interface ToImagesPayload {
  file_id: string;
  format: "png" | "jpg";
  dpi: number;
  pages?: string | null;
}

/** POST /api/media/download */
export interface MediaDownloadPayload {
  url: string;
  mode: "video" | "audio";
  video_format?: string;                   // mp4 | best (video mode)
  audio_format?: string;                   // mp3 | m4a | best (audio mode)
  audio_quality?: number | null;           // kbps: 320/256/192/128/96/64
  height?: number | null;                  // resolution cap (video mode)
  prefer_h264?: boolean;                   // video mode
  format_ids?: { video: string; audio: string } | null;  // explicit ids (advanced)
  video_id: string;
  title: string;
  is_live: boolean;
}

/** PUT /api/media/cookies */
export interface CookiePrefsPayload {
  source: "none" | "file" | "browser";
  browser?: string;
  cookies_text?: string;
  domain?: string;
}

/** PUT /api/settings */
export interface SettingsPatch {
  patch: Partial<Settings>;
}

/** Standard task-start response */
export interface TaskStarted {
  task_id: string;
}

export const TERMINAL: TaskStatus[] = ["completed", "failed", "cancelled"];
export const isTerminal = (s: TaskStatus) => TERMINAL.includes(s);

export function humanSize(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(1)} ${units[u]}`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (s == null || isNaN(s)) return "-";
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
