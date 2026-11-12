"""TaskManager and process-tree tests.

These tests import only `backend.app.tasks` / `backend.app.utils` (stdlib
only), so they exercise the lifecycle logic without booting the web app.
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
import textwrap
import time
from pathlib import Path

import pytest

from backend.app.tasks import TaskCancelled, TaskManager
from backend.app.utils import kill_process_tree, popen_group_kwargs

# A grandchild that touches a heartbeat file until it is killed. A fresh
# mtime therefore means "still alive" on every OS (no pid probing needed).
_CHILD = textwrap.dedent("""
    import sys, time
    while True:
        with open(sys.argv[1], "w") as fh:
            fh.write(str(time.time()))
        time.sleep(0.05)
""")

_PARENT = textwrap.dedent("""
    import subprocess, sys, time
    subprocess.Popen([sys.executable, "-c", sys.argv[2], sys.argv[1]])
    time.sleep(60)
""")


def _beat(path: Path) -> str:
    try:
        return path.read_text()
    except OSError:
        return ""


def test_kill_process_tree_kills_asyncio_process_and_its_child():
    """B1: an asyncio Process has no .poll(); the old code silently did
    nothing, leaving the grandchild (ffmpeg in real life) running."""
    heartbeat = Path(tempfile.mkdtemp(prefix="pms_kill_")) / "beat.txt"

    async def scenario():
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-c", _PARENT, str(heartbeat), _CHILD,
            **popen_group_kwargs())
        # wait for the grandchild to start beating
        deadline = time.time() + 10
        while not _beat(heartbeat) and time.time() < deadline:
            await asyncio.sleep(0.05)
        assert _beat(heartbeat), "grandchild never started"

        kill_process_tree(proc)
        await asyncio.wait_for(proc.wait(), timeout=10)   # parent reaped
        await asyncio.sleep(0.4)                           # let any stragglers die
        first = _beat(heartbeat)
        await asyncio.sleep(0.4)
        return proc.returncode, first, _beat(heartbeat)

    rc, first, second = asyncio.run(scenario())
    assert rc is not None
    assert first == second, "grandchild is still running after kill_process_tree"


def test_kill_process_tree_tolerates_none_and_finished_process():
    kill_process_tree(None)

    async def scenario():
        proc = await asyncio.create_subprocess_exec(sys.executable, "-c", "pass")
        await proc.wait()
        kill_process_tree(proc)        # already exited: must be a no-op
    asyncio.run(scenario())


# ----------------------------------------------------------------- helpers
async def _wait_terminal(tm: TaskManager, task_id: str, timeout: float = 10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        rec = tm.get(task_id)
        if rec is not None and rec.status in ("completed", "failed", "cancelled"):
            return rec
        await asyncio.sleep(0.02)
    raise TimeoutError(f"task {task_id} did not finish")


def _manager(tmp: Path, concurrent: int = 2) -> TaskManager:
    return TaskManager(tmp / "history.json", history_limit=50, max_concurrent=concurrent)


# ------------------------------------------------------------------- B2
def test_remove_refuses_running_task_and_keeps_it_cancellable():
    """B2: remove() used to pop the record *before* the status check, so a
    refused delete silently orphaned a running task."""
    tmp = Path(tempfile.mkdtemp(prefix="pms_tm_"))

    async def scenario():
        tm = _manager(tmp)

        async def slow(rec):
            await asyncio.sleep(30)
            return {}

        tid = tm.submit("t", "slow", slow)
        for _ in range(100):                      # let it start
            if tm.get(tid).status == "running":
                break
            await asyncio.sleep(0.01)
        assert tm.remove(tid) is False
        assert tm.get(tid) is not None, "running task must stay registered"
        assert tm.cancel(tid) is True             # still cancellable
        rec = await _wait_terminal(tm, tid)
        assert rec.status == "cancelled"
        assert tm.remove(tid) is True
        assert tm.get(tid) is None

    asyncio.run(scenario())


# ------------------------------------------------------------------- B4
def test_cancel_thread_task_waits_for_worker_and_keeps_semaphore():
    """B4: cancel() used to cancel the asyncio wrapper of a to_thread worker.
    The wrapper then released the semaphore and rmtree'd temp_dir while the
    thread was still writing. Thread tasks must cancel cooperatively."""
    tmp = Path(tempfile.mkdtemp(prefix="pms_tm_"))
    work_dir = tmp / "work"
    work_dir.mkdir()
    state = {"thread_alive": False, "sem_during_run": None}

    def worker(rec):
        state["thread_alive"] = True
        try:
            while True:
                if rec.cancel_event.is_set():
                    raise TaskCancelled("Cancelled by user")
                (rec.temp_dir / "partial.bin").write_bytes(b"x")
                time.sleep(0.02)
        finally:
            time.sleep(0.15)                      # slow unwind
            state["thread_alive"] = False

    async def scenario():
        tm = _manager(tmp, concurrent=1)
        initial = tm.sem._value
        temp = tmp / "task-temp"
        temp.mkdir()

        async def runner(rec):
            return await asyncio.to_thread(worker, rec)

        tid = tm.submit("pdf_x", "cooperative", runner, temp_dir=temp, cooperative=True)
        for _ in range(200):
            if state["thread_alive"]:
                break
            await asyncio.sleep(0.01)
        assert state["thread_alive"]
        state["sem_during_run"] = tm.sem._value
        assert tm.cancel(tid) is True
        rec = await _wait_terminal(tm, tid)
        # terminal status is only reported once the worker has really exited
        assert state["thread_alive"] is False
        assert rec.status == "cancelled"
        assert state["sem_during_run"] == initial - 1
        assert tm.sem._value == initial, "semaphore must be restored exactly once"
        assert not temp.exists(), "temp dir is removed only after the worker is done"

    asyncio.run(scenario())


def test_cancel_after_worker_finished_discards_outputs():
    """A cancel that lands after the last cooperative check must not leave a
    result behind: the output the worker produced is deleted."""
    tmp = Path(tempfile.mkdtemp(prefix="pms_tm_"))
    out = tmp / "result.pdf"

    def worker(rec):
        rec.cancel_event.wait(5)                  # cancel arrives mid-flight...
        out.write_bytes(b"%PDF-fake")             # ...but we finish anyway
        return {"outputs": [{"name": out.name, "path": str(out)}]}

    async def scenario():
        tm = _manager(tmp)

        async def runner(rec):
            return await asyncio.to_thread(worker, rec)

        tid = tm.submit("pdf_x", "late cancel", runner, cooperative=True)
        await asyncio.sleep(0.1)
        tm.cancel(tid)
        rec = await _wait_terminal(tm, tid)
        assert rec.status == "cancelled"
        assert not out.exists()

    asyncio.run(scenario())


def test_cancel_queued_cooperative_task_never_starts():
    tmp = Path(tempfile.mkdtemp(prefix="pms_tm_"))
    started = []

    async def scenario():
        tm = _manager(tmp, concurrent=1)

        async def blocker(rec):
            await asyncio.sleep(30)

        async def second(rec):
            started.append(True)
            return {}

        first = tm.submit("t", "blocker", blocker)
        queued = tm.submit("pdf_x", "queued", second, cooperative=True)
        await asyncio.sleep(0.05)
        assert tm.get(queued).status == "queued"
        assert tm.cancel(queued) is True
        rec = await _wait_terminal(tm, queued)
        assert rec.status == "cancelled" and not started
        tm.cancel(first)
        await _wait_terminal(tm, first)

    asyncio.run(scenario())


# --------------------------------------------------------- publish_outputs
def test_publish_outputs_moves_files_and_never_overwrites():
    from backend.app.utils import publish_outputs

    root = Path(tempfile.mkdtemp(prefix="pms_pub_"))
    staging, out_dir = root / "staging", root / "out"
    staging.mkdir()
    out_dir.mkdir()
    (out_dir / "merged.pdf").write_bytes(b"existing")          # name already taken
    (staging / "merged.pdf").write_bytes(b"new")

    result = publish_outputs(
        {"outputs": [{"name": "merged.pdf", "path": str(staging / "merged.pdf")}],
         "info": {"pages": 1}}, staging, out_dir)

    entry = result["outputs"][0]
    assert entry["name"] == "merged (1).pdf"
    assert Path(entry["path"]).read_bytes() == b"new"
    assert (out_dir / "merged.pdf").read_bytes() == b"existing"   # untouched
    assert not (staging / "merged.pdf").exists()
    assert entry["size"] == 3 and entry["url"].startswith("/api/download?path=")
    assert result["info"] == {"pages": 1}


def test_publish_outputs_rolls_back_on_failure(monkeypatch):
    from backend.app import utils

    root = Path(tempfile.mkdtemp(prefix="pms_pub_"))
    staging, out_dir = root / "staging", root / "out"
    staging.mkdir()
    out_dir.mkdir()
    for n in ("a.bin", "b.bin"):
        (staging / n).write_bytes(b"x")

    real_move = utils._move_file
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OSError("disk full")
        real_move(src, dst)

    monkeypatch.setattr(utils, "_move_file", flaky)
    with pytest.raises(OSError):
        utils.publish_outputs(
            {"outputs": [{"path": str(staging / "a.bin")},
                         {"path": str(staging / "b.bin")}]}, staging, out_dir)
    assert list(out_dir.iterdir()) == [], "partial publish must be rolled back"


# ------------------------------------------------------------- B9 / B11
def test_reconfigure_applies_new_limits_to_new_tasks():
    """B9: max_concurrent_tasks / history_limit used to be read once at boot."""
    tmp = Path(tempfile.mkdtemp(prefix="pms_tm_"))

    async def scenario():
        tm = _manager(tmp, concurrent=1)
        running = []

        async def slow(rec):
            running.append(rec.id)
            await asyncio.sleep(30)

        tm.reconfigure(history_limit=20, max_concurrent=3)
        assert tm.history_limit == 20 and tm.max_concurrent == 3
        ids = [tm.submit("t", f"t{i}", slow) for i in range(3)]
        await asyncio.sleep(0.1)
        assert len(running) == 3, "all three must run concurrently after reconfigure"
        for tid in ids:
            tm.cancel(tid)
        for tid in ids:
            await _wait_terminal(tm, tid)

    asyncio.run(scenario())


def test_finished_records_are_trimmed_from_memory_but_stay_in_history(monkeypatch):
    """B11: tasks (each with a 400-line log) must not accumulate forever."""
    import backend.app.tasks as tasks_mod
    monkeypatch.setattr(tasks_mod, "MEMORY_KEEP", 3)
    tmp = Path(tempfile.mkdtemp(prefix="pms_tm_"))

    async def scenario():
        tm = _manager(tmp, concurrent=2)

        async def quick(rec):
            rec.add_log("line")
            return {}

        ids = []
        for i in range(6):
            tid = tm.submit("t", f"t{i}", quick)
            await _wait_terminal(tm, tid)
            ids.append(tid)
        in_memory = [t for t in ids if tm.get(t) is not None]
        assert in_memory == ids[-3:]
        listed = {t["id"] for t in tm.list_tasks(limit=50)}
        assert set(ids) <= listed, "trimmed tasks are still served from history"

    asyncio.run(scenario())
