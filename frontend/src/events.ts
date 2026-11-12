/** Session event bus — the single source for the application event log.
 *
 *  Events are emitted exclusively for REAL application activity observed in
 *  the frontend: API operations (success/failure), task lifecycle changes,
 *  and similar user-triggered actions. Nothing decorative, nothing
 *  fabricated. Messages never contain cookie data, unredacted subprocess
 *  output or filesystem paths that are not already shown in the UI.
 */
export type EventSeverity = "info" | "warning" | "error";

export interface AppEvent {
  id: number;
  ts: number; // epoch ms
  severity: EventSeverity;
  message: string;
  task?: boolean; // task lifecycle event
}

type Listener = (events: AppEvent[]) => void;

const CAP = 200;
let events: AppEvent[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function notify() {
  const snapshot = events;
  listeners.forEach((l) => l(snapshot));
}

export function emitEvent(severity: EventSeverity, message: string, task = false): void {
  const trimmed = (message || "").trim();
  if (!trimmed) return;
  events = [{ id: nextId++, ts: Date.now(), severity, message: trimmed.slice(0, 300), task }, ...events].slice(0, CAP);
  notify();
}

export function clearEvents(): void {
  events = [];
  notify();
}

export function getEvents(): AppEvent[] {
  return events;
}

export function subscribeEvents(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
