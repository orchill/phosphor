"""Asynchronous task manager: queue, progress, cancellation, history.

Every long-running operation (PDF processing and media downloads) runs as a
task. Tasks are executed on the asyncio loop (media) or in worker threads
(CPU-bound PDF work via `asyncio.to_thread`), report progress into a
`TaskRecord`, can be cancelled (cooperative flag + subprocess termination),
and are archived into a bounded JSON history file.
"""
from __future__ import annotations

import asyncio
import json
import threading
import traceback
from pathlib import Path
from typing import Any, Awaitable, Callable

from .utils import atomic_write_text, kill_process_tree, new_id, now_iso, remove_tree

TERMINAL = {"completed", "failed", "cancelled"}
LOG_CAP = 400
# Finished records kept in memory (with their log). Older ones are still
# served from the persisted history, just without the live log.
MEMORY_KEEP = 50


class TaskCancelled(Exception):
    """Raised inside a runner when the user requested cancellation."""


class TaskRecord:
    __slots__ = (
        "id", "kind", "title", "status", "progress", "stage", "message",
        "error", "result", "log", "meta", "created_at", "started_at",
        "finished_at", "async_task", "cancel_event", "process", "temp_dir",
        "cooperative",
    )

    def __init__(self, kind: str, title: str, meta: dict | None = None,
                 temp_dir: Path | None = None, cooperative: bool = False):
        self.id = new_id()
        self.kind = kind
        self.title = title
        self.status = "queued"
        self.progress: float | None = None
        self.stage = "Queued"
        self.message = ""
        self.error = ""
        self.result: dict = {}
        self.log: list[str] = []
        self.meta = meta or {}
        self.created_at = now_iso()
        self.started_at: str | None = None
        self.finished_at: str | None = None
        # runtime-only (never serialized)
        self.async_task: asyncio.Task | None = None
        self.cancel_event = threading.Event()
        self.process: Any = None          # running subprocess handle (media)
        self.temp_dir: Path | None = temp_dir
        # True for runners that execute in a worker thread (asyncio.to_thread).
        # A thread cannot be interrupted, so cancelling its asyncio wrapper
        # would release the semaphore and delete temp_dir while it still runs.
        # Such tasks are cancelled cooperatively only: cancel_event is set and
        # the worker raises TaskCancelled at its next check.
        self.cooperative = cooperative

    # ------------------------------------------------------------- helpers
    def add_log(self, line: str) -> None:
        line = (line or "").rstrip()
        if not line:
            return
        self.log.append(line[:500])
        if len(self.log) > LOG_CAP:
            del self.log[: len(self.log) - LOG_CAP]

    def report(self, stage: str, progress: float | None = None) -> None:
        self.stage = stage
        if progress is not None:
            self.progress = max(0.0, min(1.0, float(progress)))

    def public(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "status": self.status,
            "progress": self.progress,
            "stage": self.stage,
            "message": self.message,
            "error": self.error,
            "result": self.result,
            "log_tail": self.log[-60:],
            "meta": self.meta,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class TaskManager:
    def __init__(self, history_path: Path, history_limit: int, max_concurrent: int):
        self.history_path = history_path
        self.history_limit = max(5, int(history_limit))
        self.max_concurrent = max(1, int(max_concurrent))
        self.sem = asyncio.Semaphore(self.max_concurrent)
        self.tasks: dict[str, TaskRecord] = {}
        self.history: list[dict] = []
        self._load_history()

    # ------------------------------------------------------------- history
    def _load_history(self) -> None:
        try:
            if self.history_path.exists():
                raw = self.history_path.read_text(encoding="utf-8")
                data = json.loads(raw)
                if isinstance(data, list):
                    self.history = [d for d in data if isinstance(d, dict)]
        except Exception:
            self.history = []

    def _archive(self, rec: TaskRecord) -> None:
        entry = rec.public()
        entry.pop("log_tail", None)
        self.history.insert(0, entry)
        del self.history[self.history_limit:]
        try:
            atomic_write_text(
                self.history_path,
                json.dumps(self.history[:self.history_limit], indent=1, ensure_ascii=False))
        except OSError:
            pass  # history persistence is best-effort; runtime keeps working
        self._trim_memory()

    def reconfigure(self, history_limit: int | None = None,
                    max_concurrent: int | None = None) -> None:
        """Apply changed settings without a restart.

        A new concurrency limit replaces the semaphore: tasks already running
        or waiting keep the old one (`async with` holds the object it entered
        with), so the change affects tasks submitted from now on.
        """
        if history_limit is not None:
            self.history_limit = max(5, int(history_limit))
            del self.history[self.history_limit:]
        if max_concurrent is not None:
            n = max(1, int(max_concurrent))
            if n != self.max_concurrent:
                self.max_concurrent = n
                self.sem = asyncio.Semaphore(n)

    def _trim_memory(self) -> None:
        """Drop the oldest finished records beyond MEMORY_KEEP (B11)."""
        finished = [r for r in self.tasks.values() if r.status in TERMINAL]
        if len(finished) <= MEMORY_KEEP:
            return
        finished.sort(key=lambda r: r.finished_at or "")
        for rec in finished[:-MEMORY_KEEP]:
            self.tasks.pop(rec.id, None)

    # -------------------------------------------------------------- submit
    def submit(
        self,
        kind: str,
        title: str,
        runner: Callable[[TaskRecord], Awaitable[dict]],
        meta: dict | None = None,
        temp_dir: Path | None = None,
        cooperative: bool = False,
    ) -> str:
        rec = TaskRecord(kind, title, meta=meta, temp_dir=temp_dir,
                         cooperative=cooperative)
        self.tasks[rec.id] = rec
        rec.async_task = asyncio.get_running_loop().create_task(self._wrap(rec, runner))
        return rec.id

    async def _wrap(self, rec: TaskRecord, runner: Callable[[TaskRecord], Awaitable[dict]]):
        try:
            async with self.sem:
                if rec.cancel_event.is_set():
                    rec.status = "cancelled"
                    rec.stage = "Cancelled"
                    rec.finished_at = now_iso()
                    return
                rec.status = "running"
                rec.started_at = now_iso()
                rec.report("Starting")
                result = await runner(rec) or {}
                outputs = result.get("outputs", []) or []
                if rec.cooperative and rec.cancel_event.is_set():
                    # Cancel landed after the worker's last check: honour it
                    # and do not leave a result the user asked to abort.
                    for out in outputs:
                        try:
                            Path(out.get("path", "")).unlink(missing_ok=True)
                        except OSError:
                            pass
                    raise TaskCancelled("Cancelled by user")
                for out in outputs:
                    p = Path(out.get("path", ""))
                    if not p.is_file() or p.stat().st_size <= 0:
                        raise RuntimeError(f"Output validation failed: '{out.get('name')}' is missing or empty")
                rec.result = result
                rec.status = "completed"
                rec.progress = 1.0
                rec.stage = "Completed"
        except TaskCancelled:
            rec.status = "cancelled"
            rec.stage = "Cancelled"
        except asyncio.CancelledError:
            rec.status = "cancelled" if rec.cancel_event.is_set() else "failed"
            rec.error = rec.error or ("Task was cancelled." if rec.status == "cancelled"
                                      else "Task interrupted unexpectedly.")
            rec.stage = "Cancelled" if rec.status == "cancelled" else "Failed"
        except Exception as exc:  # noqa: BLE001 - boundary of task execution
            rec.add_log(f"ERROR: {exc}")
            rec.add_log(traceback.format_exc(limit=8))
            rec.status = "failed"
            rec.error = str(exc) or exc.__class__.__name__
            rec.stage = "Failed"
        finally:
            rec.finished_at = rec.finished_at or now_iso()
            rec.process = None
            rec.async_task = None
            self._archive(rec)
            if rec.temp_dir:
                await remove_tree(rec.temp_dir)

    # -------------------------------------------------------------- cancel
    def cancel(self, task_id: str) -> bool:
        rec = self.tasks.get(task_id)
        if rec is None or rec.status in TERMINAL:
            return False
        rec.cancel_event.set()
        rec.message = "Cancellation requested"
        was_queued = rec.status == "queued"
        if was_queued:
            rec.status = "cancelled"
            rec.stage = "Cancelled"
        kill_process_tree(rec.process)
        # A running thread worker unwinds by itself once it sees cancel_event;
        # only queued tasks (no thread yet) and subprocess/async runners are
        # hard-cancelled.
        if rec.async_task is not None and (was_queued or not rec.cooperative):
            rec.async_task.cancel()
        return True

    def remove(self, task_id: str) -> bool:
        """Remove a finished task from memory + history.

        A task that is still queued/running is refused *and left registered*,
        so it can still be cancelled and is still seen by shutdown().
        """
        rec = self.tasks.get(task_id)
        if rec is not None and rec.status not in TERMINAL:
            return False  # refuse to forget running tasks; cancel first
        self.tasks.pop(task_id, None)
        before = len(self.history)
        self.history = [h for h in self.history if h.get("id") != task_id]
        if len(self.history) != before:
            try:
                atomic_write_text(
                    self.history_path,
                    json.dumps(self.history, indent=1, ensure_ascii=False))
            except OSError:
                pass
        return True

    # ---------------------------------------------------------------- list
    @staticmethod
    def annotate(entry: dict) -> dict:
        """Copy of a task dict whose outputs say whether the file still exists.

        History outlives the files (the user may delete or move them), so the
        UI must not offer a dead download link. The stored entry is left
        untouched: `exists` is a point-in-time fact and is never persisted.
        """
        result = entry.get("result")
        outputs = result.get("outputs") if isinstance(result, dict) else None
        if not outputs:
            return entry
        annotated = []
        for o in outputs:
            try:
                exists = Path(o["path"]).is_file()
            except (KeyError, TypeError, OSError, ValueError):
                exists = False
            annotated.append({**o, "exists": exists})
        return {**entry, "result": {**result, "outputs": annotated}}

    def list_tasks(self, limit: int = 50, status: str | None = None,
                   kind: str | None = None) -> list[dict]:
        items: list[dict] = [r.public() for r in self.tasks.values()]
        known = {i["id"] for i in items}
        items.extend(h for h in self.history if h.get("id") not in known)
        if status:
            items = [i for i in items if i["status"] == status]
        if kind:
            items = [i for i in items if i["kind"] == kind]
        items.sort(key=lambda i: i.get("created_at") or "", reverse=True)
        return [self.annotate(i) for i in items[: max(1, min(int(limit), 500))]]

    def get(self, task_id: str) -> TaskRecord | None:
        return self.tasks.get(task_id)

    async def shutdown(self, grace: float = 20.0) -> None:
        """Terminate running subprocesses, cancel tasks and WAIT for workers
        to unwind - the app must not log 'shutdown complete' while threads or
        subprocesses are still active.

        Thread workers are asked to stop via cancel_event and given `grace`
        seconds; only then is their wrapper hard-cancelled.
        """
        pending = []
        cooperative = []
        for rec in list(self.tasks.values()):
            if rec.status in ("queued", "running"):
                rec.cancel_event.set()
                kill_process_tree(rec.process)
                if rec.async_task is None:
                    continue
                pending.append(rec.async_task)
                if rec.cooperative and rec.status == "running":
                    cooperative.append(rec.async_task)
                else:
                    rec.async_task.cancel()
        if cooperative:
            await asyncio.wait(cooperative, timeout=grace)
            for t in cooperative:
                if not t.done():
                    t.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
