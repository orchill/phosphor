import type {
  CompressPayload, CookiePrefsPayload, CookieStatus, CookieTestResult,
  EditPagesPayload, ImagesToPdfPayload, MediaDownloadPayload, MediaInfo,
  MergePayload, Settings, SettingsPatch, SimpleOpPayload, SplitPayload,
  SystemInfo, TaskRecord, TaskStarted, ToImagesPayload, UploadedFile,
} from "./types";
import { emitEvent } from "./events";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const res = await fetch(path, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") detail = j.detail;
      else if (Array.isArray(j.detail)) detail = j.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
    } catch {
      /* not json */
    }
    // genuine application events only; polling GETs are not logged
    if (method !== "GET") {
      emitEvent("error", `${method} ${path.split("?")[0]} failed - ${detail}`);
    } else if (!path.startsWith("/api/tasks")) {
      emitEvent("error", `${method} ${path.split("?")[0]} failed - ${detail}`);
    }
    throw new Error(detail);
  }
  if (method !== "GET") {
    emitEvent("info", `${method} ${path.split("?")[0]}`);
  }
  return res.json() as Promise<T>;
}

const JSON_HDR = { "Content-Type": "application/json" };

// ---------------------------------------------------------------- files
export const uploadFiles = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return api<UploadedFile[]>("/api/upload", { method: "POST", body: fd });
};
export const listFiles = () => api<UploadedFile[]>("/api/files");
export const deleteFile = (id: string) => api<{ deleted: string }>(`/api/files/${id}`, { method: "DELETE" });
export const clearWorkspace = () => api<{ removed: number }>("/api/system/clear-workspace", { method: "POST" });
export const rawUrl = (id: string) => `/api/file/${id}/raw`;
export const thumbUrl = (id: string, w = 240) => `/api/file/${id}/thumbnail?width=${w}`;
export const pageThumbUrl = (id: string, page: number, w = 200) =>
  `/api/pdf/${id}/page/${page}/thumbnail?width=${w}`;
export const downloadUrl = (path: string) => `/api/download?path=${encodeURIComponent(path)}`;

// ---------------------------------------------------------------- tasks
export const getTask = (id: string) => api<TaskRecord>(`/api/tasks/${id}`);
export const listTasks = (limit = 50, status?: string, kind?: string) => {
  const q = new URLSearchParams({ limit: String(limit) });
  if (status) q.set("status", status);
  if (kind) q.set("kind", kind);
  return api<TaskRecord[]>(`/api/tasks?${q}`);
};
export const cancelTask = (id: string) => api<{ cancelled: string }>(`/api/tasks/${id}/cancel`, { method: "POST" });
export const deleteTask = (id: string) => api<{ removed: string }>(`/api/tasks/${id}`, { method: "DELETE" });
export const getTaskLog = (id: string) =>
  api<{ id: string; log: string[] }>(`/api/tasks/${id}/log`);

// ---------------------------------------------------------------- pdf ops
// Payloads are typed against the FastAPI request schemas (see types.ts).
const startOp = (endpoint: string, payload: unknown) =>
  api<TaskStarted>(`/api/pdf/${endpoint}`, {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(payload),
  });

export const opMerge = (payload: MergePayload) => startOp("merge", payload);
export const opImagesToPdf = (payload: ImagesToPdfPayload) => startOp("images-to-pdf", payload);
export const opEditPages = (payload: EditPagesPayload) => startOp("pages", payload);
export const opSplit = (payload: SplitPayload) => startOp("split", payload);
export const opCompress = (payload: CompressPayload) => startOp("compress", payload);
export const opExtractImages = (payload: SimpleOpPayload) => startOp("extract-images", payload);
export const opToImages = (payload: ToImagesPayload) => startOp("to-images", payload);

// ---------------------------------------------------------------- media
export const mediaInfo = (url: string) =>
  api<MediaInfo>(`/api/media/info?url=${encodeURIComponent(url)}`);
export const mediaDownload = (payload: MediaDownloadPayload) =>
  api<TaskStarted>("/api/media/download", {
    method: "POST",
    headers: JSON_HDR,
    body: JSON.stringify(payload),
  });
export const getCookieStatus = () => api<CookieStatus>("/api/media/cookies");
export const saveCookiePrefs = (payload: CookiePrefsPayload) =>
  api<CookieStatus>("/api/media/cookies", {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify(payload),
  });
export const clearCookiePrefs = () =>
  api<CookieStatus>("/api/media/cookies", { method: "DELETE" });
export const testCookiePrefs = () =>
  api<CookieTestResult>("/api/media/cookies/test", { method: "POST" });

// ---------------------------------------------------------------- system
export const systemInfo = () => api<SystemInfo>("/api/system/info");
export const getSettings = () => api<Settings>("/api/settings");
export const saveSettings = (patch: SettingsPatch["patch"]) =>
  api<{ config: Settings; restart_required: string[] }>("/api/settings", {
    method: "PUT",
    headers: JSON_HDR,
    body: JSON.stringify({ patch } satisfies SettingsPatch),
  });
export const openOutputFolder = () => api<{ opened: string }>("/api/system/open-output-folder", { method: "POST" });
