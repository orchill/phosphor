/** Global task tray state (F1).
 *
 *  Tasks started anywhere are tracked here (persisted in sessionStorage so a
 *  page reload keeps the list), polled by the shared store, and announced when
 *  they finish: a toast, and a desktop Notification only while the tab is
 *  hidden. Pages need no changes - every <TaskPanel> registers its task.
 */
import {
  createContext, ReactNode, useCallback, useContext, useEffect, useMemo,
  useRef, useState, useSyncExternalStore,
} from "react";
import { useToast } from "./ctx";
import { getStoreVersion, getTaskPoll, subscribeAllTasks, subscribeTask } from "./taskStore";
import { setTitlePrefix } from "./title";
import { TaskRecord, isTerminal } from "./types";

const STORAGE_KEY = "pms-tray-tasks";
const NOTIF_ASKED_KEY = "pms-notif-asked";
const MAX_TRACKED = 20;

function loadIds(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, MAX_TRACKED) : [];
  } catch {
    return [];
  }
}

function saveIds(ids: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable: the tray just won't survive a reload */
  }
}

/** Title prefix for the running tasks: "[45%] " for one (or the average when
 *  several report progress), "[…] " when none can say. Empty when idle. */
export function progressPrefix(running: TaskRecord[]): string {
  if (running.length === 0) return "";
  const known = running.map((t) => t.progress).filter((p): p is number => p != null);
  if (known.length === 0) return "[…] ";
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  return `[${Math.round(avg * 100)}%] `;
}

export interface TrayTask { id: string; task: TaskRecord | null; gone: boolean }

interface TasksCtx {
  /** Newest first. */
  tasks: TrayTask[];
  running: number;
  track: (id: string) => void;
  untrack: (id: string) => void;
}

const Ctx = createContext<TasksCtx>({ tasks: [], running: 0, track: () => {}, untrack: () => {} });
export const useTasks = () => useContext(Ctx);

function maybeAskNotificationPermission() {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    if (localStorage.getItem(NOTIF_ASKED_KEY)) return;
    localStorage.setItem(NOTIF_ASKED_KEY, "1");   // ask once, ever
    void Notification.requestPermission();
  } catch {
    /* notifications unsupported or blocked */
  }
}

function desktopNotify(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;   // the toast is enough
    new Notification(title, { body, tag: "phosphor-task" });
  } catch {
    /* ignore */
  }
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [ids, setIds] = useState<string[]>(loadIds);

  const track = useCallback((id: string) => {
    setIds((cur) => {
      if (cur.includes(id)) return cur;
      maybeAskNotificationPermission();
      const next = [id, ...cur].slice(0, MAX_TRACKED);
      saveIds(next);
      return next;
    });
  }, []);

  const untrack = useCallback((id: string) => {
    setIds((cur) => {
      const next = cur.filter((x) => x !== id);
      saveIds(next);
      return next;
    });
  }, []);

  // keep every tracked task polled for as long as it is tracked, on any page
  useEffect(() => {
    const unsubs = ids.map((id) => subscribeTask(id, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [ids]);

  // re-render on any store change
  useSyncExternalStore(subscribeAllTasks, getStoreVersion);

  const tasks: TrayTask[] = ids.map((id) => {
    const p = getTaskPoll(id);
    return { id, task: p.task, gone: p.gone };
  });
  const runningTasks = tasks
    .map((t) => t.task)
    .filter((t): t is TaskRecord => !!t && !isTerminal(t.status));

  // announce completions: only tasks seen alive in this session
  const lastStatus = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    for (const { id, task } of tasks) {
      if (!task) continue;
      const prev = lastStatus.current.get(id);
      lastStatus.current.set(id, task.status);
      if (prev === undefined || isTerminal(prev as TaskRecord["status"]) || !isTerminal(task.status)) continue;
      if (task.status === "completed") {
        toast.push("success", `${task.title} - completed`);
        desktopNotify("Task completed", task.title);
      } else if (task.status === "failed") {
        toast.push("error", `${task.title} - failed: ${task.error || "unknown error"}`);
        desktopNotify("Task failed", task.title);
      } else {
        toast.push("info", `${task.title} - cancelled`);
      }
    }
  });

  useEffect(() => {
    setTitlePrefix(progressPrefix(runningTasks));
  });

  const value = useMemo<TasksCtx>(
    () => ({ tasks, running: runningTasks.length, track, untrack }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, getStoreVersion(), track, untrack],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
