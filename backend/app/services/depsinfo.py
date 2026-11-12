"""Dependency and environment diagnostics (versions, paths, disk space)."""
from __future__ import annotations

import importlib.metadata as ilmd
import platform
import shutil
import sys

from .. import APP_NAME, __version__
from ..config import Config


def _pkg_version(name: str) -> str:
    try:
        return ilmd.version(name)
    except Exception:
        return "not found"


def system_info(cfg: Config, refresh: bool = False) -> dict:
    """Environment diagnostics. Spawns tool probes on a cache miss, so call it
    through `asyncio.to_thread` from async code."""
    from .media_service import find_ffmpeg, ytdlp_probe, ytdlp_source

    ffmpeg_path, ffmpeg_ver = find_ffmpeg(cfg, refresh)
    ffprobe = shutil.which("ffprobe") or ""
    # Probe the yt-dlp that downloads really use (custom path included) and
    # decide "found" from its exit code, not from the setting being non-empty.
    ytdlp_ok, ytdlp_ver = ytdlp_probe(cfg, refresh)

    free_gb = None
    try:
        import shutil as _sh
        free_gb = round(_sh.disk_usage(cfg.output_dir).free / 1024**3, 1)
    except Exception:
        pass

    return {
        "app": APP_NAME,
        "app_version": __version__,
        "python": sys.version.split()[0],
        "platform": platform.platform(terse=True),
        "output_dir": str(cfg.output_dir),
        "free_disk_gb": free_gb,
        "deps": {
            "ffmpeg": {"found": ffmpeg_path is not None,
                       "path": str(ffmpeg_path) if ffmpeg_path else "",
                       "version": ffmpeg_ver},
            "ffprobe": {"found": bool(ffprobe), "path": ffprobe},
            "ytdlp": {"found": ytdlp_ok,
                      "version": ytdlp_ver,
                      "source": ytdlp_source(cfg)},
            "pymupdf": _pkg_version("PyMuPDF"),
            "pypdf": _pkg_version("pypdf"),
            "pillow": _pkg_version("pillow"),
            "fastapi": _pkg_version("fastapi"),
        },
    }
