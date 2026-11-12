"""Small shared helpers: ids, timestamps, filename sanitation, formatting."""
from __future__ import annotations

import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def new_id() -> str:
    return uuid.uuid4().hex


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


_STEM_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def sanitize_stem(name: str, max_len: int = 80) -> str:
    """Turn an arbitrary filename into a safe output stem."""
    stem = Path(name or "").stem or "output"
    stem = _STEM_RE.sub("_", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .")
    if not stem:
        stem = "output"
    return stem[:max_len].strip(" .") or "output"


def unique_path(path: Path) -> Path:
    """Return `path`, or `stem (n).ext` for the first free n. Never overwrites."""
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    for i in range(1, 10000):
        cand = path.with_name(f"{stem} ({i}){suffix}")
        if not cand.exists():
            return cand
    raise RuntimeError("Could not allocate a free filename in the output directory")


def atomic_write_text(path: Path, text: str) -> None:
    """Write text to `path` atomically (tmp file in the same dir + os.replace).

    A crash mid-write can never leave a truncated or half-written file behind.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def popen_group_kwargs() -> dict:
    """Spawn kwargs that make a child the leader of its own process group.

    On POSIX this lets `kill_process_tree` signal the whole group (yt-dlp plus
    the ffmpeg it spawns) with one `killpg`. Windows needs nothing: `taskkill
    /T` walks the tree by parent pid.
    """
    return {} if sys.platform == "win32" else {"start_new_session": True}


def _is_alive(proc) -> bool:
    """True while `proc` has not exited.

    Handles both `subprocess.Popen` (has `poll()`) and
    `asyncio.subprocess.Process` (no `poll()`; `returncode` is None until the
    loop has reaped it).
    """
    poll = getattr(proc, "poll", None)
    if callable(poll):
        return poll() is None
    return getattr(proc, "returncode", None) is None


def _signal_posix_tree(proc, sig: int) -> None:
    """Signal the process group when `proc` leads one, else just `proc`."""
    import os as _os
    try:
        pgid = _os.getpgid(proc.pid)
    except OSError:
        return  # already gone
    # Never signal our own group: only a child started with a new session
    # (see `popen_group_kwargs`) is its own leader.
    if pgid == proc.pid and pgid != _os.getpgrp():
        try:
            _os.killpg(pgid, sig)
        except OSError:
            pass
    else:
        try:
            _os.kill(proc.pid, sig)
        except OSError:
            pass


def kill_process_tree(proc) -> None:
    """Terminate a spawned subprocess together with its children.

    Media tools nest: yt-dlp (a python process) spawns ffmpeg. Killing only
    the parent would leave the child running and holding file locks.
    - Windows: `taskkill /T /F` handles the whole tree.
    - POSIX: the child is started in its own session (`popen_group_kwargs`),
      so the whole process group gets SIGTERM and then SIGKILL.
    Works for `subprocess.Popen` and `asyncio.subprocess.Process` alike.
    """
    if proc is None:
        return
    try:
        if not _is_alive(proc):
            return
    except Exception:
        return
    if sys.platform == "win32":
        try:
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                capture_output=True, timeout=10, check=False)
        except (OSError, subprocess.TimeoutExpired):
            pass
    else:
        import signal
        _signal_posix_tree(proc, signal.SIGTERM)
        # No grace period: this runs on the event loop and the task's output
        # is discarded anyway, so go straight on to SIGKILL for the group.
        _signal_posix_tree(proc, signal.SIGKILL)
    try:
        if _is_alive(proc):
            proc.kill()
    except Exception:
        pass


def human_size(num: float | int | None) -> str:
    if num is None:
        return "-"
    num = float(num)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num) < 1024.0 or unit == "TB":
            return (f"{num:.1f} {unit}" if unit != "B" else f"{int(num)} B")
        num /= 1024.0
    return "-"


def fmt_duration(seconds: float | int | None) -> str:
    if seconds is None:
        return "-"
    try:
        seconds = int(float(seconds))
    except (TypeError, ValueError):
        return "-"
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
