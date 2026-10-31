import { useEffect, useRef, useState } from "react";
import { getTask } from "./api";
import { TaskRecord, isTerminal } from "./types";

/** Poll a task by id until it reaches a terminal state. */
export function useTask(taskId: string | null): TaskRecord | null {
  const [task, setTask] = useState<TaskRecord | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTask(null);
    if (!taskId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const t = await getTask(taskId);
        if (stopped) return;
        setTask(t);
        if (!isTerminal(t.status)) timer.current = setTimeout(poll, 800);
      } catch {
        if (!stopped) timer.current = setTimeout(poll, 2000);
      }
    };
    poll();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [taskId]);
  return task;
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
