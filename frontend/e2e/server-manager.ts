/** Manages the real backend server for E2E tests, bound to an isolated
 *  config/data/output tree (frontend/e2e/.run) so the developer's own
 *  data/ directory is never touched. */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, "..", "..");
export const PYTHON =
  process.env.PMS_PYTHON ?? path.join(ROOT, ".venv", "Scripts", "python.exe");
export const RUNDIR = path.join(HERE, ".run");
export const FIXTURES = path.join(HERE, ".fixtures");
export const E2E_PORT = 8799;
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const CONFIG_PATH = path.join(RUNDIR, "config.json");
export const PID_PATH = path.join(RUNDIR, "server.pid");
/** Compiled by global-setup from stub-ytdlp/stub.cs (native exe: Python's
 *  create_subprocess_exec refuses .cmd/.bat wrappers on modern Windows). */
export const STUB_YTDLP = path.join(FIXTURES, "stub-ytdlp.exe");
export const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";

let proc: ChildProcess | null = null;

export function writeTestConfig(overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(RUNDIR, "data"), { recursive: true });
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(
      {
        host: "127.0.0.1",
        port: E2E_PORT,
        output_dir: path.join(RUNDIR, "outputs"),
        data_dir: path.join(RUNDIR, "data"),
        ffmpeg_path: "",
        ytdlp_path: STUB_YTDLP,
        open_browser: false,
        max_concurrent_tasks: 1,
        max_upload_mb: 32,
        max_download_gb: 0,
        max_duration_hours: 0,
        history_limit: 100,
        ...overrides,
      },
      null,
      2,
    ),
  );
}

export async function startServer(): Promise<void> {
  proc = spawn(
    PYTHON,
    [path.join(ROOT, "run.py"), "--port", String(E2E_PORT), "--no-browser"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PDFMEDIA_CONFIG: CONFIG_PATH,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[srv] ${d}`));
  proc.stderr?.on("data", (d: Buffer) => process.stdout.write(`[srv:err] ${d}`));
  fs.writeFileSync(PID_PATH, String(proc.pid));
  await waitForHealth(45_000);
}

export async function waitForHealth(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) return;
      lastErr = `status ${r.status}`;
    } catch (e) {
      lastErr = String((e as Error).message ?? e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server not healthy in ${timeoutMs}ms (last: ${lastErr})`);
}

export async function stopServer(): Promise<void> {
  const p = proc;
  proc = null;
  let pid = p?.pid;
  if (!pid && fs.existsSync(PID_PATH)) {
    pid = Number(fs.readFileSync(PID_PATH, "utf-8"));
  }
  if (!pid) return;
  await killPid(pid);
  // wait until the port is actually free (health endpoint must refuse)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE_URL}/api/health`);
      await new Promise((r) => setTimeout(r, 300)); // still up
    } catch {
      return; // down
    }
  }
}

export async function killPid(pid: number): Promise<void> {
  if (!pid) return;
  if (process.platform === "win32") {
    const { spawn: sp } = await import("node:child_process");
    sp("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  await new Promise((r) => setTimeout(r, 800));
}
