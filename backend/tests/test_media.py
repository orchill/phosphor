"""Media pipeline tests using a LOCAL HTTP server (no external websites).

Covers: yt-dlp generic-extractor metadata, download with progress, MP3
conversion through FFmpeg, MP4 output, and cancellation cleanup.
Real-YouTube verification is intentionally NOT automated here (see README).
"""
from __future__ import annotations

import asyncio
import functools
import http.server
import json
import pathlib
import shutil
import socket
import subprocess
import tempfile
import threading
import time

import pytest

from backend.app.config import Config
from backend.app.services import media_service
from backend.app.tasks import TaskCancelled, TaskManager

TMP = pathlib.Path(tempfile.mkdtemp(prefix="pms_media_"))

HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                   check=True, capture_output=True)


def _make_wav(path: pathlib.Path, seconds: float = 1.0, rate: int = 8000) -> None:
    """Synthesize a valid WAV without ffmpeg (stdlib only)."""
    import math
    import struct
    import wave
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(int(rate * seconds)):
            frames += struct.pack("<h", int(9000 * math.sin(2 * math.pi * 440 * i / rate)))
        w.writeframes(bytes(frames))


@pytest.fixture(scope="module")
def media_server():
    """Serve generated media files over local HTTP."""
    root = TMP / "www"
    root.mkdir(exist_ok=True)
    wav = root / "tone.wav"
    mp4 = root / "clip.mp4"
    big = root / "bigfile.mp4"
    if HAS_FFMPEG:
        _ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-q:a", "9",
                str(wav))
        _ffmpeg("-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15",
                "-f", "lavfi", "-i", "sine=frequency=300:duration=2",
                "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
                "-shortest", str(mp4))
    else:
        _make_wav(wav)  # metadata/cancel tests stay meaningful without ffmpeg
    if not big.exists():
        big.write_bytes(b"\x5a" * (48 * 1024 * 1024))  # 48 MB for cancel test
    big2 = root / "bigfile2.mp4"
    if not big2.exists():
        big2.write_bytes(b"\xa5" * (24 * 1024 * 1024))  # second file, concurrent test

    port = _free_port()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield {"port": port, "root": root, "wav": wav, "mp4": mp4, "big": big, "big2": big2}
    httpd.shutdown()


def _test_cfg(tmp_name: str) -> Config:
    cfg_dir = TMP / tmp_name
    cfg_dir.mkdir(exist_ok=True)
    cfg_file = cfg_dir / "config.json"
    cfg_file.write_text(json.dumps({"output_dir": str(cfg_dir / "out"),
                                    "data_dir": str(cfg_dir / "data")}),
                        encoding="utf-8")
    return Config(cfg_file)


def _run_manager(coro_factory) -> dict:
    return asyncio.run(coro_factory())


# ------------------------------------------------------------------ info
def test_ytdlp_generic_metadata(media_server):
    """yt-dlp retrieves metadata for a supported (local) URL."""
    url = f"http://127.0.0.1:{media_server['port']}/tone.wav"
    cfg = _test_cfg("info")

    async def go():
        return await media_service.fetch_info(cfg, url)

    info = asyncio.run(go())
    assert info["title"]
    assert info["id"]
    assert info["formats"], "expected at least one format from generic extractor"


def test_ytdlp_metadata_error_message(media_server):
    async def go():
        return await media_service.fetch_info(
            _test_cfg("info_err"), f"http://127.0.0.1:{media_server['port']}/missing.mp4")
    with pytest.raises(RuntimeError) as exc:
        asyncio.run(go())
    assert "404" in str(exc.value) or "not found" in str(exc.value).lower() or \
        "unavailable" in str(exc.value).lower()


# -------------------------------------------------------------- downloads
@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed")
def test_mp3_conversion_via_ffmpeg(media_server):
    """WAV source -> MP3 output through yt-dlp + FFmpeg."""
    cfg = _test_cfg("mp3")
    params = {"url": f"http://127.0.0.1:{media_server['port']}/tone.wav",
              "mode": "audio", "audio_format": "mp3", "audio_quality": 192,
              "video_id": "tone", "title": "tone"}

    async def go():
        tm = TaskManager(cfg.history_path, 10, 2)

        async def runner(rec):
            return await media_service.download_task(rec, cfg, params)

        task_id = tm.submit("media_audio", "tone test", runner)
        rec = tm.get(task_id)
        while rec.status not in ("completed", "failed", "cancelled"):
            await asyncio.sleep(0.2)
        return rec

    rec = asyncio.run(go())
    assert rec.status == "completed", (rec.status, rec.error, rec.log[-5:])
    out = rec.result["outputs"][0]
    assert out["name"].endswith(".mp3")
    assert out["size"] > 1000
    produced = pathlib.Path(out["path"])
    assert produced.exists()


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed")
def test_m4a_conversion_via_ffmpeg(media_server):
    """WAV source -> M4A output through yt-dlp + FFmpeg (same post-processor path)."""
    cfg = _test_cfg("m4a")
    params = {"url": f"http://127.0.0.1:{media_server['port']}/tone.wav",
              "mode": "audio", "audio_format": "m4a", "audio_quality": 192,
              "video_id": "tone", "title": "tone"}

    async def go():
        tm = TaskManager(cfg.history_path, 10, 2)

        async def runner(rec):
            return await media_service.download_task(rec, cfg, params)

        task_id = tm.submit("media_audio", "tone m4a test", runner)
        rec = tm.get(task_id)
        while rec.status not in ("completed", "failed", "cancelled"):
            await asyncio.sleep(0.2)
        return rec

    rec = asyncio.run(go())
    assert rec.status == "completed", (rec.status, rec.error, rec.log[-5:])
    assert rec.result["outputs"][0]["name"].endswith(".m4a")


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed")
def test_mp4_output(media_server):
    cfg = _test_cfg("mp4")
    params = {"url": f"http://127.0.0.1:{media_server['port']}/clip.mp4",
              "mode": "video", "video_format": "mp4", "video_id": "clip",
              "title": "clip", "merge": True}

    async def go():
        tm = TaskManager(cfg.history_path, 10, 2)

        async def runner(rec):
            return await media_service.download_task(rec, cfg, params)

        task_id = tm.submit("media_video", "clip test", runner)
        rec = tm.get(task_id)
        while rec.status not in ("completed", "failed", "cancelled"):
            await asyncio.sleep(0.2)
        return rec

    rec = asyncio.run(go())
    assert rec.status == "completed", (rec.status, rec.error, rec.log[-5:])
    assert rec.result["outputs"][0]["name"].endswith(".mp4")


def test_download_cancel_cleans_part_files(media_server):
    """Cancelled downloads are killed, marked cancelled, and .part files removed."""
    cfg = _test_cfg("cancel")
    out_dir = cfg.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    params = {"url": f"http://127.0.0.1:{media_server['port']}/bigfile.mp4",
              "mode": "video", "video_format": "best", "video_id": "big",
              "title": "big", "merge": False}

    async def go():
        tm = TaskManager(cfg.history_path, 10, 2)

        async def runner(rec):
            return await media_service.download_task(rec, cfg, params)

        task_id = tm.submit("media_video", "cancel test", runner)
        rec = tm.get(task_id)
        # wait until download has actually started producing progress
        deadline = time.time() + 30
        while time.time() < deadline:
            if rec.status == "running" and (rec.progress or 0) > 0:
                break
            if rec.status in ("completed", "failed"):  # too fast to cancel
                return rec
            await asyncio.sleep(0.05)
        tm.cancel(task_id)
        while rec.status not in ("completed", "failed", "cancelled"):
            await asyncio.sleep(0.1)
        return rec

    rec = asyncio.run(go())
    assert rec.status == "cancelled", rec.status
    leftovers = [p.name for p in out_dir.glob("*.part")]
    assert not leftovers, f"part files left behind: {leftovers}"
    assert not any(p.name.endswith(".part") for p in out_dir.iterdir())


def test_concurrent_downloads_do_not_interfere(media_server):
    """B3: each download has its own temp dir and reports its own output path.

    Cancelling one download must neither delete the other's partial file nor
    make the other pick up the wrong result file."""
    cfg = _test_cfg("concurrent")
    out_dir = cfg.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    port = media_server["port"]

    def params(name: str) -> dict:
        return {"url": f"http://127.0.0.1:{port}/{name}.mp4", "mode": "video",
                "video_format": "best", "video_id": name, "title": name,
                "merge": False}

    async def go():
        tm = TaskManager(cfg.history_path, 10, 2)

        def submit(name: str) -> str:
            async def runner(rec, _p=params(name)):
                return await media_service.download_task(rec, cfg, _p)
            return tm.submit("media_video", name, runner)

        a, b = submit("bigfile"), submit("bigfile2")
        rec_a, rec_b = tm.get(a), tm.get(b)
        deadline = time.time() + 30
        while time.time() < deadline and rec_a.status == "queued":
            await asyncio.sleep(0.05)
        tm.cancel(a)                       # may already be finished on fast disks
        while (rec_a.status not in ("completed", "failed", "cancelled")
               or rec_b.status not in ("completed", "failed", "cancelled")):
            await asyncio.sleep(0.1)
        return rec_a, rec_b

    rec_a, rec_b = asyncio.run(go())
    assert rec_b.status == "completed", (rec_b.status, rec_b.error, rec_b.log[-5:])
    out_b = pathlib.Path(rec_b.result["outputs"][0]["path"])
    assert "bigfile2" in out_b.name and out_b.is_file()
    assert out_b.stat().st_size == media_server["big2"].stat().st_size
    assert rec_a.status in ("cancelled", "completed"), (rec_a.status, rec_a.error)
    if rec_a.status == "cancelled":
        assert not [p.name for p in out_dir.iterdir()
                    if p.name.startswith("bigfile [")], "cancelled download left a file"
    else:
        out_a = pathlib.Path(rec_a.result["outputs"][0]["path"])
        assert out_a != out_b and "bigfile2" not in out_a.name
    assert not list(out_dir.glob("*.part"))
    assert not list(out_dir.glob("*.ytdl")) and not list(out_dir.glob("*.temp"))


def test_ytdlp_probe_decides_found_by_exit_code_and_is_cached(monkeypatch):
    """B5/B10: probes are cached, and a failing yt-dlp is reported as not found."""
    from types import SimpleNamespace
    cfg = _test_cfg("probe")
    media_service.clear_tool_cache()
    calls: list = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=1, stdout="", stderr="boom")

    monkeypatch.setattr(media_service.subprocess, "run", fake_run)
    assert media_service.ytdlp_probe(cfg) == (False, "unknown")
    media_service.ytdlp_probe(cfg)
    assert len(calls) == 1, "second probe must come from the cache"
    media_service.ytdlp_probe(cfg, refresh=True)
    assert len(calls) == 2, "refresh=True must re-probe"
    media_service.clear_tool_cache()


def test_ytdlp_source_reports_missing_custom_path():
    cfg = _test_cfg("source")
    assert media_service.ytdlp_source(cfg) == "python module"
    cfg.update({"ytdlp_path": str(TMP / "definitely-not-here" / "yt-dlp")})
    assert media_service.ytdlp_source(cfg) == "python module (custom path not found)"


# ------------------------------------------------------------ progress
def test_progress_formatting_never_shows_raw_floats():
    """B6: speed arrives as raw bytes/s, eta as seconds; NA values are tolerated."""
    assert media_service.format_speed("2345678.91") == "2.2 MB/s"
    assert media_service.format_speed("NA") is None
    assert media_service.format_speed("garbage") is None
    assert media_service.format_eta("72") == "1:12"
    assert media_service.format_eta("12.4") == "0:12"
    assert media_service.format_eta("None") is None
    stage = media_service.download_stage(45.2, 100.0, "2345678.91", "12")
    assert stage == "Downloading 45% at 2.2 MB/s, ETA 0:12"
    assert "2345678" not in stage
    unknown = media_service.download_stage(None, 5_300_000.0, "NA", "NA")
    assert unknown == "Downloading 5.3 MB (size unknown)"


def test_stream_tracker_is_monotonic_across_video_and_audio_streams():
    """B7: bv*+ba downloads two streams, each 0 -> 100 %; the bar must not reset."""
    tr = media_service.StreamTracker(*media_service._stream_plan({"mode": "video"}))
    seen: list[float] = []
    labels: list[str] = []
    for total, steps in ((1000.0, (100, 500, 1000)), (200.0, (20, 100, 200))):
        for done in steps:
            progress, _pct = tr.update(float(done), total)
            seen.append(progress)
            labels.append(tr.label())
    assert seen == sorted(seen), f"progress went backwards: {seen}"
    assert labels[:3] == ["stream 1/2 (video)"] * 3
    assert labels[3:] == ["stream 2/2 (audio)"] * 3
    assert abs(seen[2] - 0.46) < 1e-9          # end of stream 1 = half of the 92 % share
    assert abs(seen[-1] - 0.92) < 1e-9


def test_stream_tracker_adapts_when_more_streams_than_expected():
    tr = media_service.StreamTracker(1)
    tr.update(500.0, 1000.0)
    tr.update(1000.0, 1000.0)
    before = tr.progress
    progress, _ = tr.update(10.0, 400.0)       # counter reset -> second stream
    assert tr.count == 2 and progress >= before
    tr.set_expected(3)
    assert tr.count == 3
    assert media_service._stream_plan({"mode": "audio"}) == (1, ("audio",))
    assert media_service._stream_plan(
        {"mode": "video", "format_ids": {"video": "22", "audio": ""}})[0] == 1


def test_run_ytdlp_timeout_kills_and_reaps_the_process(monkeypatch):
    """B12: the timeout path used to call kill() without wait(): zombie process."""
    import sys
    spawned = []
    real = asyncio.create_subprocess_exec

    async def spy(*args, **kw):
        proc = await real(*args, **kw)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(media_service.asyncio, "create_subprocess_exec", spy)

    async def go():
        await media_service._run_ytdlp(
            [sys.executable, "-c", "import time; time.sleep(60)"], timeout=0.3)

    with pytest.raises(RuntimeError, match="timed out"):
        asyncio.run(go())
    assert spawned and spawned[0].returncode is not None, "process was not reaped"


# ------------------------------------------------------ TaskManager unit
def test_session_challenged_detection():
    assert media_service._session_challenged(
        "ERROR: [youtube] abc: The page needs to be reloaded.")
    assert media_service._session_challenged("ERROR: No video formats found!")
    assert media_service._session_challenged(
        "ERROR: Sign in to confirm you're not a bot.")
    assert not media_service._session_challenged("ERROR: HTTP Error 404: Not Found")
    assert not media_service._session_challenged("")


def test_task_manager_cancel_and_temp_cleanup():
    async def go():
        cfg = _test_cfg("tm_cancel")
        cfg.ensure_dirs()
        tm = TaskManager(cfg.history_path, 10, 2)
        temp_dir = cfg.tmp_dir / "task-temp-check"
        temp_dir.mkdir(parents=True, exist_ok=True)
        started = asyncio.Event()
        release = asyncio.Event()

        async def runner(rec):
            started.set()
            await release.wait()
            return {"outputs": []}

        task_id = tm.submit("unit", "cancel me", runner, temp_dir=temp_dir)
        rec = tm.get(task_id)
        await started.wait()
        assert rec.status == "running"
        tm.cancel(task_id)
        await asyncio.sleep(0.2)
        assert rec.status == "cancelled"
        assert not temp_dir.exists(), "temp dir must be cleaned after cancel"

        # queued task cancelled before start
        block = asyncio.Event()

        async def slow_runner(rec):
            await block.wait()
            return {}

        id1 = tm.submit("unit", "a", slow_runner)
        id2 = tm.submit("unit", "b", slow_runner)
        tm.cancel(id2)
        rec2 = tm.get(id2)
        assert rec2.status == "cancelled"
        block.set()
        await asyncio.sleep(0.2)

    asyncio.run(go())


def test_history_limit_enforced():
    async def go():
        cfg = _test_cfg("hist")
        cfg.ensure_dirs()
        tm = TaskManager(cfg.history_path, 5, 2)

        for i in range(7):
            async def runner(rec, i=i):
                return {}
            tm.submit("unit", f"t{i}", runner)
            await asyncio.sleep(0.05)
        await asyncio.sleep(0.3)
        assert len(tm.history) <= 5
        import json
        data = json.loads(cfg.history_path.read_text())
        assert len(data) <= 5

    asyncio.run(go())


# --------------------------------------------------- audio payload hygiene
def test_audio_mode_drops_video_fields(client, monkeypatch):
    """A stale video format id / resolution from a previous video attempt must
    never reach the download runner when the user switches to audio mode."""
    from backend.app.routers import media as media_router
    captured: dict = {}

    def fake_wrapper(cfg, params):
        captured.update(params)

        async def runner(rec):
            return {}
        return runner

    monkeypatch.setattr(media_router.media_service, "download_task_wrapper", fake_wrapper)
    monkeypatch.setattr(media_router, "validate_media_url", lambda u: u)
    r = client.post("/api/media/download", json={
        "url": "https://example.com/v.mp4", "mode": "audio",
        "audio_format": "mp3", "height": 1080,
        "format_ids": {"video": "137", "audio": ""},
        "video_id": "abc123", "title": "t",
    })
    assert r.status_code == 200
    assert captured["height"] is None
    assert captured["format_ids"] is None
    assert captured["prefer_h264"] is False


# ------------------------------------------------------- lifecycle hardening
def test_shutdown_awaits_running_tasks():
    async def go():
        cfg = _test_cfg("shutdown_await")
        cfg.ensure_dirs()
        tm = TaskManager(cfg.history_path, 5, 2)
        started = asyncio.Event()

        async def runner(rec):
            started.set()
            await asyncio.sleep(30)
            return {}

        tid = tm.submit("unit", "slow runner", runner)
        await started.wait()
        await asyncio.wait_for(tm.shutdown(), timeout=5)
        assert tm.get(tid).status in ("cancelled", "failed"), tm.get(tid).status

    asyncio.run(go())


def test_kill_process_tree_kills_child_processes():
    import subprocess as sp
    import sys as _sys
    from backend.app.utils import kill_process_tree
    # child spawns its own child; killing the tree must end both
    proc = sp.Popen([_sys.executable, "-c",
                     "import subprocess, sys, time;"
                     "subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']);"
                     "time.sleep(60)"])
    try:
        kill_process_tree(proc)
        assert proc.wait(timeout=10) is not None
    finally:
        if proc.poll() is None:
            proc.kill()
