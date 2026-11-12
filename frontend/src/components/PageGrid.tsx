import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { pageThumbUrl } from "../api";
import { CARD } from "../ui";

export interface PageState {
  page: number; // 1-based original page number
  rotation: number; // accumulated display rotation (deg)
}

interface Props {
  fileId: string;
  pages: PageState[];
  setPages: (p: PageState[]) => void;
  selection: Set<number>;
  setSelection: (s: Set<number>) => void;
  allowReorder?: boolean;
  allowRotate?: boolean;
  allowDelete?: boolean;
  allowSelect?: boolean;
  width?: number;
}

/** Thumbnail width to request: CSS width x device pixel ratio, so thumbnails
 *  stay sharp on HiDPI screens (the backend caps it at 640). */
export function thumbRequestWidth(cssWidth: number, dpr: number = 1): number {
  return Math.min(640, Math.max(60, Math.round(cssWidth * Math.max(1, dpr))));
}

export default function PageGrid({
  fileId,
  pages,
  setPages,
  selection,
  setSelection,
  allowReorder,
  allowRotate,
  allowDelete,
  allowSelect,
  width = 210,
}: Props) {
  const dragFrom = useRef<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const thumbWidth = thumbRequestWidth(width, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);

  const toggleSelect = (page: number) => {
    const next = new Set(selection);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    setSelection(next);
  };

  const rotate = (idx: number, delta: number) => {
    const next = [...pages];
    next[idx] = { ...next[idx], rotation: (next[idx].rotation + delta + 360) % 360 };
    setPages(next);
  };

  const move = (idx: number, delta: number) => {
    const to = idx + delta;
    if (to < 0 || to >= pages.length) return;
    const next = [...pages];
    const [moved] = next.splice(idx, 1);
    next.splice(to, 0, moved);
    setPages(next);
    setAnnounce(`Page ${moved.page} moved to position ${to + 1} of ${next.length}.`);
  };

  const remove = (idx: number) => {
    const p = pages[idx];
    const nextSel = new Set(selection);
    nextSel.delete(p.page);
    setSelection(nextSel);
    setPages(pages.filter((_, i) => i !== idx));
    setAnnounce(`Page ${p.page} removed. ${pages.length - 1} pages remain.`);
  };

  return (
    <>
      {/* screen-reader announcements for reorder/remove actions */}
      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" role="list">
        {pages.map((p, idx) => {
          const selected = selection.has(p.page);
          return (
            <li
              key={p.page}
              draggable={allowReorder}
              onDragStart={() => {
                dragFrom.current = idx;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = dragFrom.current;
                dragFrom.current = null;
                if (from == null || from === idx) return;
                const next = [...pages];
                const [moved] = next.splice(from, 1);
                next.splice(idx, 0, moved);
                setPages(next);
                setAnnounce(`Page ${moved.page} moved to position ${idx + 1} of ${next.length}.`);
              }}
              className={`group relative overflow-hidden rounded border-2 bg-panel transition-colors
                ${selected ? "border-acc ring-1 ring-acc/50" : "border-line"}
                ${allowReorder ? "cursor-grab" : ""}`}
            >
              <button
                type="button"
                onClick={() => allowSelect && toggleSelect(p.page)}
                onKeyDown={(e) => {
                  if (!allowReorder) return;
                  if (e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    move(idx, -1);
                  } else if (e.ctrlKey && (e.key === "ArrowRight" || e.key === "ArrowDown")) {
                    e.preventDefault();
                    move(idx, 1);
                  }
                }}
                aria-pressed={allowSelect ? selected : undefined}
                aria-label={`Page ${p.page}${selected ? " (selected)" : ""}${allowReorder ? " - Ctrl+Arrow keys to move" : ""}`}
                className="block w-full bg-elev focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                {/* Square, fixed-size tile: the grid never shifts while thumbnails
                    load, and a page rotated by 90/270 degrees (portrait <-> landscape)
                    still fits because the rotated box is square too. */}
                <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden">
                  <img
                    src={pageThumbUrl(fileId, p.page, thumbWidth)}
                    alt={`Page ${p.page} thumbnail`}
                    loading="lazy"
                    decoding="async"
                    className="pointer-events-none h-full w-full object-contain transition-transform duration-200"
                    style={{ transform: `rotate(${p.rotation}deg)` }}
                  />
                </span>
              </button>

              <div className="flex items-center justify-between gap-0.5 px-2 py-1.5">
                <span
                  className={`min-w-0 truncate font-mono text-[0.6875rem] ${selected ? "text-accText" : "text-ink3"}`}
                >
                  {p.rotation ? `p${p.page} (${p.rotation}deg)` : `p${p.page}`}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {allowReorder && (
                    <>
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-30 disabled:pointer-events-none"
                        aria-label={`Move page ${p.page} to an earlier position`}
                        title="Move earlier (Ctrl+←)"
                      >
                        <ArrowLeft size={13} aria-hidden />
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === pages.length - 1}
                        className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-30 disabled:pointer-events-none"
                        aria-label={`Move page ${p.page} to a later position`}
                        title="Move later (Ctrl+→)"
                      >
                        <ArrowRight size={13} aria-hidden />
                      </button>
                    </>
                  )}
                  {allowRotate && (
                    <>
                      <button
                        onClick={() => rotate(idx, -90)}
                        className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        aria-label={`Rotate page ${p.page} left`}
                        title="Rotate left"
                      >
                        <RotateCcw size={13} aria-hidden />
                      </button>
                      <button
                        onClick={() => rotate(idx, 90)}
                        className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-accText focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        aria-label={`Rotate page ${p.page} right`}
                        title="Rotate right"
                      >
                        <RotateCw size={13} aria-hidden />
                      </button>
                    </>
                  )}
                  {allowDelete && (
                    <button
                      onClick={() => remove(idx)}
                      className="rounded-sm p-1 text-ink3 hover:bg-bad/10 hover:text-bad focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      aria-label={`Remove page ${p.page}`}
                      title="Remove page"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </span>
              </div>

              {selected && (
                <span
                  className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-sm bg-acc font-mono text-[0.6875rem] font-bold text-onAcc"
                  aria-hidden
                >
                  ✓
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function EmptyGridHint({ children }: { children: React.ReactNode }) {
  return <div className={`${CARD} p-6 text-center text-sm text-ink3`}>{children}</div>;
}
