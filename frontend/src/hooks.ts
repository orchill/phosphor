import { useEffect, useRef, useState } from "react";
import { ApiError, getTask } from "./api";
import { TaskRecord, isTerminal } from "./types";

/** Give up after this many consecutive 404s (task gone, e.g. server restart). */
const MAX_NOT_FOUND = 3;

export interface TaskPoll {
  task: TaskRecord | null;
  /** Set while polling is failing; cleared by the next successful poll. */
  error: string | null;
  /** True once polling has stopped for good (task not found). */
  gone: boolean;
}

/** Poll a task by id until it reaches a terminal state or turns out not to exist. */
export function useTask(taskId: string | null): TaskPoll {
  const [state, setState] = useState<TaskPoll>({ task: null, error: null, gone: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState({ task: null, error: null, gone: false });
    if (!taskId) return;
    let stopped = false;
    let notFound = 0;
    let failures = 0;
    const poll = async () => {
      try {
        const t = await getTask(taskId);
        if (stopped) return;
        notFound = 0;
        failures = 0;
        setState({ task: t, error: null, gone: false });
        if (!isTerminal(t.status)) timer.current = setTimeout(poll, 800);
      } catch (e) {
        if (stopped) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof ApiError && e.status === 404) {
          notFound += 1;
          if (notFound >= MAX_NOT_FOUND) {
            setState((prev) => ({ ...prev, error: msg, gone: true }));
            return;
          }
        }
        failures += 1;
        setState((prev) => ({ ...prev, error: msg }));
        // back off 2s -> 10s so a dead server is not hammered
        timer.current = setTimeout(poll, Math.min(2000 * failures, 10000));
      }
    };
    poll();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [taskId]);
  return state;
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
