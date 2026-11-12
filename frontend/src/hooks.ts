import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TaskPoll, getTaskPoll, subscribeTask } from "./taskStore";

export type { TaskPoll } from "./taskStore";

/** Watch a task by id (shared poller, see taskStore.ts). Stops by itself once
 *  the task is finished or turns out not to exist (B19). */
export function useTask(taskId: string | null): TaskPoll {
  const subscribe = useCallback(
    (listener: () => void) => (taskId ? subscribeTask(taskId, listener) : () => {}),
    [taskId],
  );
  return useSyncExternalStore(subscribe, () => getTaskPoll(taskId));
}

/** Query parameters carried in the hash route, e.g. "#/history?task=ab12".
 *  Re-reads on every hash change. */
export function useHashQuery(): URLSearchParams {
  const read = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const [params, setParams] = useState<URLSearchParams>(read);
  useEffect(() => {
    const onHash = () => setParams(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return params;
}

/** Simple list reordering for drag & drop. */
export function useReorder<T>(items: T[], setItems: (v: T[]) => void) {
  const dragIndex = useRef<number | null>(null);
  return {
    onDragStart: (i: number) => () => {
      dragIndex.current = i;
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
    },
    onDrop: (i: number) => () => {
      const from = dragIndex.current;
      dragIndex.current = null;
      if (from == null || from === i) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      setItems(next);
    },
  };
}


const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap Tab focus inside a modal while `active`; restore focus on close.
 *  Initial focus is left to the component (autofocus / explicit). */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [ref, active]);
}
