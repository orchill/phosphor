"""Media downloading service: yt-dlp (subprocess) + FFmpeg.

Security model:
- yt-dlp is executed via an argument array (no shell) with fixed flags;
  the only user-influenced arguments are the pre-validated URL and
  format-selection strings built from whitelisted patterns.
- Output is constrained to the configured output directory via -P.
- Cancellation terminates the process; partial `.part` files are removed.
"""
from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import quote

from ..config import Config
from ..security import ValidationError, ensure_within
from ..tasks import TaskCancelled, TaskRecord
from ..utils import (fmt_duration, human_size, kill_process_tree,
                     popen_group_kwargs, remove_tree)

# Stable public video ("Me at the zoo") used to verify cookie sign-in works.
TEST_VIDEO_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"

_BOT_TIP = (" Tip: open the Cookies / Sign-in tab in the Media Downloader and "
            "add your YouTube cookies - signing in with your own account usually "
            "resolves this check.")

_DL_RE = re.compile(r"^__P__(\S+)\|(\S*)\|(\S*)\|(\S*)\|(\S*)$")
_POST_RE = re.compile(r"^__POST__(\S*)\|(\S*)$")

FRIENDLY_ERRORS: list[tuple[str, str]] = [
    ("sign in to confirm", "YouTube asked for sign-in / bot verification for this video "
                           "(common when signed out, for age-restricted videos, or on "
                           "datacenter/cloud IPs)."),
    ("confirm your age", "This video is age-restricted; it requires signing in with a "
                         "YouTube account that has access (add your cookies in the "
                         "Cookies / Sign-in tab)."),
    ("members-only", "This video is members-only content and cannot be downloaded."),
    ("private video", "This video is private and cannot be downloaded."),
    ("video unavailable", "The video is unavailable (removed, region-locked, or the link is wrong)."),
    ("unsupported url", "This URL is not supported by yt-dlp."),
    ("is not a valid url", "This is not a valid URL."),
    ("http error 403", "The server refused access (HTTP 403) - the site may be blocking automated downloads."),
    ("http error 404", "The resource was not found (HTTP 404)."),
    ("http error 429", "Too many requests (HTTP 429) - the site is rate-limiting you. Try again later."),
    ("max-filesize", "The file exceeds the configured maximum download size."),
    ("ffmpeg not found", "FFmpeg was not found. Install it or set its path in Settings."),
    ("requested format is not available", "The selected format is not available for this video."),
    ("no video formats", "No downloadable formats were found for this URL."),
    ("unable to download webpage", "Could not reach the site - check your internet connection."),
    ("getaddrinfo failed", "Could not resolve the site - check the URL and your connection."),
    ("timed out", "The connection timed out."),
    # cookie-specific failures
    ("could not copy", "Could not read your browser's cookie database. Fully close the "
                       "browser (all windows) and try again, or switch to 'Paste cookies "
                       "file' in the Cookies / Sign-in tab."),
    ("cookies database", "Could not find that browser's cookie database. Make sure the "
                         "browser is installed and that you have visited/sign-ed-in to "
                         "YouTube with it at least once, or use 'Paste cookies file' instead."),
    ("cookie database is locked", "The browser's cookie database is locked - fully close the "
                                  "browser first, or use 'Paste cookies file' instead."),
    ("failed to decrypt", "Could not decrypt the browser's cookies on this system. Use "
                          "'Paste cookies file' in the Cookies / Sign-in tab instead."),
    ("no cookies exist", "No cookies were found for that browser profile - sign in to "
                          "YouTube in that browser first, or use 'Paste cookies file'."),
    ("page needs to be reloaded",
     "YouTube is challenging this sign-in session (a current YouTube change that "
     "affects all downloaders). Re-export fresh cookies: in your browser, sign out "
     "of YouTube, sign back in, then export and paste cookies immediately. Public "
     "videos still download without sign-in."),
    ("no video formats found",
     "YouTube returned no downloadable formats for this request. Try updating "
     "yt-dlp, re-exporting fresh cookies, or clearing cookies for public videos."),
]


def _friendly(cfg: Config, stderr_tail: str) -> str:
    low = stderr_tail.lower()
    for needle, msg in FRIENDLY_ERRORS:
        if needle in low:
            if needle == "sign in to confirm" and cookie_args(cfg):
                msg += (" Your cookies did not satisfy this check - re-export fresh "
                        "cookies while logged in to YouTube, or try a different account.")
            return msg
    lines = [ln.strip() for ln in stderr_tail.splitlines() if ln.strip()]
    for ln in reversed(lines):
        if ln.upper().startswith("ERROR:"):
            return ln[6:].strip()[:300]
    return (lines[-1][:300] if lines else "yt-dlp failed without an error message")


# Errors that mean YouTube is rejecting the *saved session itself*, not the
# request. When these appear while cookies are configured, retrying without
# cookies rescues public content.
_SESSION_BLOCK_MARKERS = ("page needs to be reloaded",
                          "no video formats found",
                          "sign in to confirm")


def _session_challenged(stderr_tail: str) -> bool:
    low = (stderr_tail or "").lower()
    return any(m in low for m in _SESSION_BLOCK_MARKERS)


# ------------------------------------------------------------- cookies
def cookie_args(cfg: Config) -> list[str]:
    """yt-dlp sign-in arguments based on the configured cookie source.

    Values are never logged: only flags and a file path / browser name.
    """
    src = str(cfg.get("cookie_source") or "none")
    if src == "file":
        p = cfg.cookies_path
        try:
            if p.is_file() and p.stat().st_size > 0:
                return ["--cookies", str(p)]
        except OSError:
            pass
        return []
    if src == "browser":
        b = str(cfg.get("cookie_browser") or "").strip().lower()
        if b:
            return ["--cookies-from-browser", b]
    return []


# ------------------------------------------------------------- detection
# Tool probes spawn subprocesses (`ffmpeg -version`, `yt-dlp --version`), so
# results are cached per configured path for a few minutes. Passing
# refresh=True (Settings -> diagnostics) or changing the path re-probes.
_TOOL_TTL = 300.0
_tool_cache: dict[tuple, tuple[float, object]] = {}


def clear_tool_cache() -> None:
    _tool_cache.clear()


def _cache_get(key: tuple, refresh: bool):
    if refresh:
        return None
    hit = _tool_cache.get(key)
    if hit and time.monotonic() - hit[0] < _TOOL_TTL:
        return hit[1]
    return None


def find_ffmpeg(cfg: Config, refresh: bool = False) -> tuple[Path | None, str]:
    """Locate ffmpeg: configured path first, then PATH. Returns (path, version).

    Blocking (runs `ffmpeg -version` on a cache miss): call it through
    `asyncio.to_thread` from async code.
    """
    key = ("ffmpeg", str(cfg.get("ffmpeg_path") or ""))
    hit = _cache_get(key, refresh)
    if hit is not None:
        cached_path = hit[0]
        if cached_path is not None and (cached_path.is_file() or shutil.which(str(cached_path))):
            return hit  # type: ignore[return-value]
    found = _find_ffmpeg_uncached(cfg)
    if found[0] is not None:          # never cache a miss: installing ffmpeg must just work
        _tool_cache[key] = (time.monotonic(), found)
    return found


def _find_ffmpeg_uncached(cfg: Config) -> tuple[Path | None, str]:
    candidates: list[str] = []
    if cfg.get("ffmpeg_path"):
        candidates.append(cfg.get("ffmpeg_path"))
    found = shutil.which("ffmpeg")
    if found:
        candidates.append(found)
    for cand in candidates:
        p = Path(cand)
        if p.is_file() or shutil.which(cand):
            try:
                out = subprocess.run(
                    [str(p), "-version"], capture_output=True, text=True, timeout=10,
                    shell=False)
                first = (out.stdout or out.stderr).splitlines()[0].strip()
                return p, first
            except Exception:
                continue
    return None, ""


def resolve_ytdlp_cmd(cfg: Config) -> list[str]:
    """Command array that runs yt-dlp. Custom binary overrides `python -m yt_dlp`."""
    custom = (cfg.get("ytdlp_path") or "").strip()
    if custom:
        p = Path(custom)
        if p.is_file():
            return [str(p)]
        found = shutil.which(custom)
        if found:
            return [found]
    return [sys.executable, "-m", "yt_dlp"]


def ytdlp_source(cfg: Config) -> str:
    """Where yt-dlp comes from: a usable custom path, or the python module."""
    custom = (cfg.get("ytdlp_path") or "").strip()
    if not custom:
        return "python module"
    if resolve_ytdlp_cmd(cfg)[0] != sys.executable:
        return "custom path"
    return "python module (custom path not found)"


def ytdlp_probe(cfg: Config, refresh: bool = False) -> tuple[bool, str]:
    """(works, version) of the yt-dlp that downloads will actually use.

    Blocking: call through `asyncio.to_thread` from async code.
    """
    key = ("ytdlp", str((cfg.get("ytdlp_path") or "").strip()))
    hit = _cache_get(key, refresh)
    if hit is not None:
        return hit  # type: ignore[return-value]
    try:
        out = subprocess.run(resolve_ytdlp_cmd(cfg) + ["--version"],
                             capture_output=True, text=True, timeout=20)
        result = (out.returncode == 0, (out.stdout or "").strip() or "unknown")
    except Exception:
        result = (False, "not found")
    _tool_cache[key] = (time.monotonic(), result)
    return result


def ytdlp_version(cfg: Config) -> str:
    return ytdlp_probe(cfg)[1]


def require_ffmpeg(cfg: Config, purpose: str) -> Path:
    path, _ver = find_ffmpeg(cfg)
    if path is None:
        raise ValidationError(
            f"{purpose} requires FFmpeg, which was not found. Install FFmpeg "
            "(winget install Gyan.FFmpeg on Windows, or apt install ffmpeg on Linux) "
            "and restart, or set its full path in Settings.")
    return path


# ----------------------------------------------------------------- info
AUDIO_EXTS = {"mp3", "m4a", "m4b", "wav", "ogg", "oga", "opus", "aac",
              "flac", "weba", "wma", "aiff", "alac", "mka"}


def _fmt_type(vcodec: str, acodec: str, ext: str) -> str:
    if vcodec != "none" and acodec != "none":
        return "video+audio"
    if vcodec != "none":
        return "video-only"
    if acodec != "none" or ext.lower() in AUDIO_EXTS:
        return "audio-only"
    return "other"


def _fmt_entry(f: dict) -> dict | None:
    fid = str(f.get("format_id") or "")
    ext = str(f.get("ext") or "")
    if not fid or ext in ("mhtml",) or "storyboard" in str(f.get("format_note", "")).lower():
        return None
    vcodec = f.get("vcodec") or "none"
    acodec = f.get("acodec") or "none"
    kind = _fmt_type(vcodec, acodec, ext)
    if kind == "other":
        return None
    return {
        "id": fid,
        "ext": ext,
        "type": kind,
        "vcodec": vcodec,
        "acodec": acodec,
        "height": f.get("height"),
        "width": f.get("width"),
        "fps": f.get("fps"),
        "abr": f.get("abr"),
        "vbr": f.get("vbr"),
        "tbr": f.get("tbr"),
        "filesize": f.get("filesize"),
        "filesize_approx": f.get("filesize_approx"),
        "note": f.get("format_note") or "",
    }


async def _run_ytdlp(args: list[str], timeout: float) -> tuple[int, bytes, bytes]:
    """Run yt-dlp and return (returncode, stdout, stderr)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            **popen_group_kwargs())
    except OSError as exc:
        raise RuntimeError(f"Could not start yt-dlp: {exc}")
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
        # Kill the whole tree and REAP it: a bare kill() leaves a zombie and
        # "Event loop is closed" warnings at shutdown. Also covers the caller
        # being cancelled (e.g. the browser tab closing mid-request).
        kill_process_tree(proc)
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except Exception:
            pass
        if isinstance(exc, asyncio.CancelledError):
            raise
        raise RuntimeError(f"yt-dlp timed out after {timeout:.0f}s")
    return proc.returncode or 0, stdout or b"", stderr or b""


async def fetch_info(cfg: Config, url: str) -> dict:
    """Run `yt-dlp -J` and return trimmed metadata for the UI."""
    base_args = resolve_ytdlp_cmd(cfg) + [
        "--dump-single-json", "--no-playlist", "--no-warnings",
        "--socket-timeout", "20", "--retries", "2",
    ]
    cookies = cookie_args(cfg)
    rc, stdout, stderr = await _run_ytdlp(base_args + cookies + [url], 60)
    signed_out_fallback = False
    if rc != 0 and cookies and _session_challenged(stderr.decode("utf-8", "replace")):
        # YouTube sometimes challenges the saved sign-in session itself;
        # retry anonymously so public content keeps working.
        rc, stdout, stderr = await _run_ytdlp(base_args + [url], 60)
        signed_out_fallback = rc == 0
    if rc != 0:
        tail = stderr.decode("utf-8", "replace")
        msg = _friendly(cfg, tail)
        if "sign-in" in msg and not cookies:
            msg += _BOT_TIP
        raise RuntimeError(msg)
    import json
    try:
        data = json.loads(stdout.decode("utf-8", "replace"))
    except Exception:
        raise RuntimeError("yt-dlp returned unreadable metadata")

    if data.get("_type") == "playlist" and data.get("entries"):
        data = data["entries"][0]
    formats = []
    for f in data.get("formats") or []:
        e = _fmt_entry(f)
        if e:
            formats.append(e)
    videos = [f for f in formats if f["type"] in ("video+audio", "video-only")]
    audios = [f for f in formats if f["type"] == "audio-only"]
    videos.sort(key=lambda f: (f.get("height") or 0, f.get("tbr") or 0), reverse=True)
    audios.sort(key=lambda f: (f.get("abr") or f.get("tbr") or 0), reverse=True)
    return {
        "id": str(data.get("id") or ""),
        "title": data.get("title") or "Untitled",
        "uploader": data.get("uploader") or data.get("channel") or "",
        "duration": data.get("duration"),
        "thumbnail": data.get("thumbnail") or "",
        "is_live": bool(data.get("is_live")),
        "extractor": data.get("extractor_key") or data.get("extractor") or "",
        "webpage_url": data.get("webpage_url") or url,
        "formats": formats[:80],
        "video_formats": videos[:40],
        "audio_formats": audios[:20],
        "signed_out_fallback": signed_out_fallback,
    }


# ------------------------------------------------------------- download
# ----------------------------------------------------------- progress
_NA = ("NA", "None", "", "null")
_FORMATS_RE = re.compile(r"Downloading \d+ format\(s\): (\S+)")
# Downloading takes the first 92 % of the bar; post-processing the rest.
_DL_SHARE = 0.92


def _num(raw: str | None) -> float | None:
    """yt-dlp progress field -> float, or None for NA / garbage."""
    if raw is None or raw.strip() in _NA:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value == value and value >= 0 else None   # drops NaN / negatives


def format_speed(raw: str | None) -> str | None:
    """`2345678.91` (bytes/s) -> `2.2 MB/s`."""
    value = _num(raw)
    return f"{human_size(value)}/s" if value is not None else None


def format_eta(raw: str | None) -> str | None:
    """`72` (seconds) -> `1:12`."""
    value = _num(raw)
    return fmt_duration(value) if value is not None else None


class StreamTracker:
    """Maps yt-dlp's per-stream progress onto one monotonic overall bar.

    For `bv*+ba` yt-dlp downloads the video and the audio stream one after
    the other and each goes 0 -> 100 %. A byte counter that drops below the
    previous one means a new stream started. Stream k of n fills the range
    [k/n, (k+1)/n] of the download share, and the result never moves back.
    """

    def __init__(self, expected: int = 1, labels: tuple[str, ...] = ()):
        self.expected = max(1, expected)
        self.labels = labels
        self.index = 0
        self.last_done = 0.0
        self.progress = 0.0

    def set_expected(self, n: int) -> None:
        self.expected = max(self.expected, n)

    @property
    def count(self) -> int:
        return max(self.expected, self.index + 1)

    def update(self, done: float | None, total: float | None) -> tuple[float | None, float | None]:
        """Returns (overall progress or None if unknown, stream percent)."""
        if done is None:
            return None, None
        if done + 1 < self.last_done:        # byte counter reset -> next stream
            self.index += 1
        self.last_done = done
        if not total:
            return None, None
        frac = max(0.0, min(1.0, done / total))
        overall = (self.index + frac) / self.count * _DL_SHARE
        self.progress = max(self.progress, overall)
        return self.progress, frac * 100.0

    def label(self) -> str:
        if self.count < 2:
            return ""
        name = self.labels[self.index] if self.index < len(self.labels) else ""
        return f"stream {self.index + 1}/{self.count}" + (f" ({name})" if name else "")


def _stream_plan(params: dict) -> tuple[int, tuple[str, ...]]:
    """How many streams a download is expected to fetch, and their labels."""
    if params.get("mode") == "audio":
        return 1, ("audio",)
    fmt_ids = params.get("format_ids") or {}
    if fmt_ids and not str(fmt_ids.get("audio") or "").strip():
        return 1, ("video",)
    return 2, ("video", "audio")


def download_stage(pct: float | None, done: float | None, speed: str | None,
                   eta: str | None, stream_label: str = "") -> str:
    """Human readable stage line, e.g. `Downloading 45% at 2.2 MB/s, ETA 0:12`."""
    speed_txt = format_speed(speed)
    eta_txt = format_eta(eta)
    if pct is not None:
        text = f"Downloading {pct:.0f}%"
    else:
        text = f"Downloading {(done or 0) / 1e6:.1f} MB"
    if speed_txt:
        text += f" at {speed_txt}"
    if eta_txt:
        text += f", ETA {eta_txt}"
    if pct is None:
        text += " (size unknown)"
    if stream_label:
        text += f" - {stream_label}"
    return text


def _build_format_args(params: dict, info: dict | None) -> list[str]:
    """Build yt-dlp format/codec arguments from validated UI parameters."""
    mode = params.get("mode")  # video | audio
    args: list[str] = []
    if mode == "audio":
        fmt = params.get("audio_format", "mp3")
        if fmt not in ("mp3", "m4a", "best"):
            raise ValidationError(f"Unsupported audio format: {fmt}")
        args += ["-x", "--audio-format", fmt]
        q = params.get("audio_quality")  # kbps int or None
        if fmt in ("mp3", "m4a") and q:
            q = int(q)
            if q not in (320, 256, 192, 128, 96, 64):
                raise ValidationError("Audio quality must be one of 320/256/192/128/96/64 kbps")
            args += ["--audio-quality", f"{q}K"]
        return args

    # video mode
    merge = params.get("video_format", "mp4")
    if merge not in ("mp4", "best"):
        raise ValidationError(f"Unsupported video container: {merge}")
    args += ["--merge-output-format", "mp4" if merge == "mp4" else "mkv"]

    height = params.get("height")  # None or int
    if height is not None:
        height = int(height)
        if height not in (2160, 1440, 1080, 720, 480, 360):
            raise ValidationError("Unsupported resolution preset")
    compat = bool(params.get("prefer_h264", True))

    fmt_ids = params.get("format_ids") or None
    if fmt_ids:
        vid = str(fmt_ids.get("video") or "").strip()
        aud = str(fmt_ids.get("audio") or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_.+\-]{1,40}", vid or ""):
            raise ValidationError("Invalid video format id")
        if aud and not re.fullmatch(r"[A-Za-z0-9_.+\-]{1,40}", aud):
            raise ValidationError("Invalid audio format id")
        spec = f"{vid}+{aud}" if aud else vid
        args += ["-f", f"{spec}/{vid}+ba/b"]
        return args

    sort_parts = []
    if compat:
        sort_parts += ["vcodec:h264", "acodec:aac"]
    if height:
        sort_parts.append(f"res:{height}")
    args += ["-f", f"bv*[height<={height}]+ba/b[height<={height}]/bv*+ba/b" if height else "bv*+ba/b"]
    if sort_parts:
        args += ["-S", ",".join(sort_parts)]
    return args


def download_task_wrapper(cfg: Config, params: dict):
    """Return an async runner closure for TaskManager.submit()."""
    async def runner(rec: TaskRecord) -> dict:
        return await download_task(rec, cfg, params)
    return runner


async def download_task(rec: TaskRecord, cfg: Config, params: dict) -> dict:
    """Async runner executed by TaskManager for media downloads.

    Every download works in its own temp directory (yt-dlp `-P temp:`), so
    concurrent downloads never see - or delete - each other's `.part` and
    intermediate files. The router passes `rec.temp_dir` (removed by the task
    manager); callers that did not (tests) get a private one that is removed
    here.
    """
    own_temp = rec.temp_dir is None
    temp_dir = rec.temp_dir
    if temp_dir is None:
        cfg.tmp_dir.mkdir(parents=True, exist_ok=True)
        temp_dir = Path(tempfile.mkdtemp(prefix="media-", dir=cfg.tmp_dir))
    else:
        temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        return await _download_impl(rec, cfg, params, temp_dir)
    finally:
        if own_temp:
            await remove_tree(temp_dir)


def _read_final_path(marker: Path, out_dir: Path) -> Path | None:
    """The file yt-dlp reported via `--print-to-file after_move:filepath`."""
    try:
        lines = [ln.strip() for ln in marker.read_text(encoding="utf-8").splitlines()
                 if ln.strip()]
    except OSError:
        return None
    if not lines:
        return None
    try:
        path = ensure_within(Path(lines[-1]), out_dir, "Downloaded file")
    except ValidationError:
        return None
    return path if path.is_file() else None


async def _download_impl(rec: TaskRecord, cfg: Config, params: dict,
                         temp_dir: Path) -> dict:
    from . import pdf_service  # noqa: F401  (import guard)

    url = params["url"]                      # pre-validated by the router
    out_dir = cfg.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    vid = str(params.get("video_id") or "")
    title = str(params.get("title") or "media")[:80]

    mode = params.get("mode")
    needs_ffmpeg = mode == "audio" or bool(params.get("merge", True))
    if needs_ffmpeg:
        await asyncio.to_thread(
            require_ffmpeg, cfg,
            "Audio conversion" if mode == "audio" else "Video merging")

    final_marker = temp_dir / "final.txt"
    base_args = resolve_ytdlp_cmd(cfg) + [
        "--newline", "--no-playlist", "--no-warnings", "--no-overwrites",
        "--trim-filenames", "150",
        "--retries", "3", "--fragment-retries", "3", "--socket-timeout", "30",
        "--concurrent-fragments", "4",
        "--progress-template", "download:__P__%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
        "--progress-template", "postprocess:__POST__%(progress.postprocessor)s|%(progress.status)s",
        # --print-to-file may imply quiet mode in some yt-dlp versions; make
        # sure the progress templates above are still emitted.
        "--progress",
        "-P", f"home:{out_dir}",
        "-P", f"temp:{temp_dir}",
        "-o", "%(title).140B [%(id)s].%(ext)s",
        # exact final path (after any merge/convert/move) -> no guessing
        "--print-to-file", "after_move:filepath", str(final_marker).replace("%", "%%"),
    ]
    ffmpeg_path, _ = await asyncio.to_thread(find_ffmpeg, cfg)
    if ffmpeg_path is not None:
        base_args += ["--ffmpeg-location", str(ffmpeg_path)]
    cookies = cookie_args(cfg)
    max_gb = int(cfg.get("max_download_gb") or 0)
    if max_gb > 0:
        base_args += ["--max-filesize", f"{max_gb}g"]
    max_hours = int(cfg.get("max_duration_hours") or 0)
    if max_hours > 0 and not params.get("is_live"):
        # '?' right after the operator = pass when the field is missing
        base_args += ["--match-filters", f"duration<=?{max_hours * 3600}"]
    base_args += _build_format_args(params, None)

    use_cookies = bool(cookies)
    retried_anonymous = False
    produced: list[Path] = []
    stderr_tail = ""
    rc = 0
    while True:
        args = base_args + (cookies if use_cookies else []) + [url]
        started = time.time()
        final_marker.unlink(missing_ok=True)
        rec.add_log("Command: " + " ".join(args[:6]) + " ... (URL omitted from log)")
        try:
            proc = await asyncio.create_subprocess_exec(
                *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                cwd=str(temp_dir), **popen_group_kwargs())
        except OSError as exc:
            raise RuntimeError(f"Could not start yt-dlp: {exc}")
        rec.process = proc

        stderr_tail = ""

        async def pump_stderr():
            nonlocal stderr_tail
            assert proc.stderr is not None
            while True:
                raw = await proc.stderr.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", "replace").rstrip()
                stderr_tail = (stderr_tail + "\n" + line)[-4000:]
                rec.add_log(line)

        tracker = StreamTracker(*_stream_plan(params))

        async def pump_stdout():
            assert proc.stdout is not None
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", "replace").strip()
                m = _DL_RE.match(line)
                if m:
                    done = _num(m.group(1))
                    total = _num(m.group(2)) or _num(m.group(3))
                    progress, pct = tracker.update(done, total)
                    if progress is not None:
                        rec.progress = max(rec.progress or 0.0, progress)
                    elif done is not None and not total:
                        rec.progress = None      # size unknown: indeterminate bar
                    rec.stage = download_stage(pct, done, m.group(4), m.group(5),
                                               tracker.label())
                    continue
                m = _POST_RE.match(line)
                if m:
                    name, status = m.group(1) or "Post-processing", m.group(2) or ""
                    rec.progress = max(rec.progress or 0, 0.93)
                    rec.stage = f"Processing ({name}) {status}".strip()
                    continue
                m = _FORMATS_RE.search(line)
                if m:
                    # "Downloading 1 format(s): 137+140" -> two streams
                    tracker.set_expected(m.group(1).count("+") + 1)
                if line and not line.startswith("[download]"):
                    rec.add_log(line)

        out_task = asyncio.create_task(pump_stdout())
        err_task = asyncio.create_task(pump_stderr())
        try:
            await proc.wait()
        except asyncio.CancelledError:
            # user cancellation -> hard kill, then re-raise. Reap the process
            # afterwards: on Windows the .part file handle lingers until exit.
            kill_process_tree(proc)
            try:
                await proc.wait()
            except Exception:
                pass
            raise
        finally:
            if out_task:
                out_task.cancel()
            if err_task:
                err_task.cancel()
            for t in (out_task, err_task):
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
            rec.process = None
            # Partial files live in this task's private temp dir only. Wipe
            # them now (the handle can linger a moment on Windows) so a
            # failed attempt never leaks into a retry.
            if rec.cancel_event.is_set() or proc.returncode != 0:
                await remove_tree(temp_dir, keep_root=True)

        if rec.cancel_event.is_set():
            raise TaskCancelled("Cancelled by user")
        rc = proc.returncode or 0
        if (rc != 0 and cookies and use_cookies and not retried_anonymous
                and _session_challenged(stderr_tail)):
            retried_anonymous = True
            use_cookies = False
            rec.add_log("YouTube challenged the saved sign-in - retrying without "
                        "cookies (public content only)")
            continue
        break

    if rc != 0:
        msg = _friendly(cfg, stderr_tail)
        if "sign-in" in msg and not cookie_args(cfg):
            msg += _BOT_TIP
        raise RuntimeError(msg)

    # The exact file yt-dlp wrote, as reported by --print-to-file.
    final = _read_final_path(final_marker, out_dir)
    if final is not None:
        produced = [final]
    else:
        # Older yt-dlp without after_move printing: fall back to the newest
        # file written since this attempt started whose name carries our id.
        rec.add_log("yt-dlp did not report the output path; scanning the output folder")
        for p in out_dir.iterdir():
            if (p.is_file() and p.stat().st_mtime >= started - 1
                    and not p.name.endswith((".part", ".ytdl", ".temp"))
                    and (not vid or f"[{vid}]" in p.name)):
                produced.append(p)
        produced.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if not produced:
        raise RuntimeError("Download finished but no output file was found")
    outputs = [{
        "name": p.name, "path": str(p), "size": p.stat().st_size,
        "url": f"/api/download?path={quote(p.as_posix())}",
    } for p in produced[:1]]
    total_size = outputs[0]["size"]
    rec.message = (f"Saved {title} ({total_size / 1e6:.1f} MB)"
                   + (" (fetched without sign-in)" if retried_anonymous else ""))
    return {"outputs": outputs,
            "info": {"title": title, "video_id": vid, "mode": mode,
                     "duration_s": round(time.time() - started, 1),
                     "signed_out_fallback": retried_anonymous}}
