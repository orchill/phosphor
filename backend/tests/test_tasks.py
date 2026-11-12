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
