/** Shared task polling (F1).
 *
 *  One poller per task id no matter how many components watch it (the page's
 *  own panel, the header tray, the notification logic), and it keeps running
 *  while the user navigates between pages. A poller runs while it has at least
 *  one subscriber and the task is not finished; it gives up after repeated 404s
 *  (the task is gone, e.g. the server restarted) - see B19.
 */
import { ApiError, getTask } from "./api";
import { TaskRecord, isTerminal } from "./types";

export interface TaskPoll {
  task: TaskRecord | null;
  /** Set while polling is failing; cleared by the next successful poll. */
  error: string | null;
  /** True once polling has stopped for good (task not found). */
  gone: boolean;
}

/** Give up after this many consecutive 404s. */
export const MAX_NOT_FOUND = 3;
const POLL_MS = 800;

const EMPTY: TaskPoll = { task: null, error: null, gone: false };

interface Entry {
  poll: TaskPoll;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;       // a poll loop is active (request in flight or timer pending)
  inflight: boolean;      // a request is currently awaiting its response
  notFound: number;
  failures: number;
}

const entries = new Map<string, Entry>();
const globalListeners = new Set<() => void>();
let version = 0;

function entry(id: string): Entry {
  let e = entries.get(id);
  if (!e) {
    e = { poll: EMPTY, listeners: new Set(), timer: null, running: false, inflight: false, notFound: 0, failures: 0 };
    entries.set(id, e);
  }
  return e;
}

function emit(e: Entry) {
  version += 1;
  e.listeners.forEach((l) => l());
  globalListeners.forEach((l) => l());
}

function settled(e: Entry): boolean {
  return e.poll.gone || (!!e.poll.task && isTerminal(e.poll.task.status));
}

async function poll(id: string) {
  const e = entry(id);
  if (e.listeners.size === 0) { e.running = false; return; }   // nobody watching
  e.inflight = true;
  try {
    const t = await getTask(id);
    e.notFound = 0;
    e.failures = 0;
    e.poll = { task: t, error: null, gone: false };
    emit(e);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ApiError && err.status === 404) {
      e.notFound += 1;
      if (e.notFound >= MAX_NOT_FOUND) {
        e.poll = { ...e.poll, error: msg, gone: true };
        e.running = false;
        e.inflight = false;
        emit(e);
        return;
      }
    }
    e.failures += 1;
    e.poll = { ...e.poll, error: msg };
    emit(e);
  }
  e.inflight = false;
  if (settled(e) || e.listeners.size === 0) { e.running = false; return; }
  // back off 2s -> 10s while failing so a dead server is not hammered
  const delay = e.failures > 0 ? Math.min(2000 * e.failures, 10_000) : POLL_MS;
  e.timer = setTimeout(() => poll(id), delay);
}

function start(id: string) {
  const e = entry(id);
  if (e.running || settled(e)) return;
  e.running = true;
  void poll(id);
}

/** Watch a task. Returns the unsubscribe function. */
export function subscribeTask(id: string, listener: () => void): () => void {
  const e = entry(id);
  e.listeners.add(listener);
  start(id);
  return () => {
    e.listeners.delete(listener);
    if (e.listeners.size === 0 && e.timer) {
      // only a pending timer is cancelled; an in-flight request ends its own loop
      clearTimeout(e.timer);
      e.timer = null;
      if (!e.inflight) e.running = false;
    }
  };
}

export function getTaskPoll(id: string | null): TaskPoll {
  return id ? entries.get(id)?.poll ?? EMPTY : EMPTY;
}

/** Notified after every change to any task (for the tray and notifications). */
export function subscribeAllTasks(listener: () => void): () => void {
  globalListeners.add(listener);
  return () => { globalListeners.delete(listener); };
}
export const getStoreVersion = () => version;

/** Forget a task (after the user dismissed it from the tray). */
export function forgetTask(id: string) {
  const e = entries.get(id);
  if (e && e.listeners.size === 0) entries.delete(id);
}
