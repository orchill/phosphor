/** Playwright global setup: fresh isolated run dir, fixtures, stub compile,
 *  server up. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CSC, FIXTURES, PYTHON, ROOT, RUNDIR, STUB_YTDLP, startServer, writeTestConfig,
} from "./server-manager";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  fs.rmSync(RUNDIR, { recursive: true, force: true });
  fs.mkdirSync(RUNDIR, { recursive: true });
  fs.rmSync(FIXTURES, { recursive: true, force: true });
  fs.mkdirSync(FIXTURES, { recursive: true });

  // compile the deterministic yt-dlp stub (native exe, no network)
  execFileSync(CSC, [
    "-nologo", "-target:exe", `-out:${STUB_YTDLP}`,
    path.join(HERE, "stub-ytdlp", "stub.cs"),
  ], { stdio: "inherit" });

  writeTestConfig();
  execFileSync(PYTHON, [path.join(ROOT, "scripts", "gen_e2e_fixtures.py")], {
    stdio: "inherit",
  });
  if (!fs.existsSync(path.join(FIXTURES, "a.pdf"))) {
    throw new Error("fixture generation failed");
  }
  await startServer();
}
