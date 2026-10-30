import { RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useRef } from "react";
import { pageThumbUrl } from "../api";
import { CARD } from "../ui";

export interface PageState {
  page: number;      // 1-based original page number
  rotation: number;  // accumulated display rotation (deg)
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

export default function PageGrid({
  fileId, pages, setPages, selection, setSelection,
  allowReorder, allowRotate, allowDelete, allowSelect, width = 210,
}: Props) {
  const dragFrom = useRef<number | null>(null);

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

  const remove = (idx: number) => {
    const p = pages[idx];
    const nextSel = new Set(selection);
    nextSel.delete(p.page);
    setSelection(nextSel);
    setPages(pages.filter((_, i) => i !== idx));
  };

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" role="list">
      {pages.map((p, idx) => {
        const selected = selection.has(p.page);
        return (
          <li
            key={`${p.page}-${idx}`}
            draggable={allowReorder}
            onDragStart={() => { dragFrom.current = idx; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from == null || from === idx) return;
              const next = [...pages];
              const [moved] = next.splice(from, 1);
              next.splice(idx, 0, moved);
              setPages(next);
            }}
            className={`group relative overflow-hidden rounded-md border-2 bg-panel transition-colors
              ${selected ? "border-acc ring-1 ring-acc/50" : "border-line"}
              ${allowReorder ? "cursor-grab" : ""}`}
          >
            <button
              type="button"
              onClick={() => allowSelect && toggleSelect(p.page)}
              aria-pressed={selected}
              aria-label={`Page ${p.page}${selected ? " (selected)" : ""}`}
              className="block w-full bg-elev focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              <img
                src={pageThumbUrl(fileId, p.page, width)}
                alt={`Page ${p.page} thumbnail`}
                loading="lazy"
                className="pointer-events-none h-auto w-full"
                style={{ transform: `rotate(${p.rotation}deg)` }}
              />
            </button>

            <div className="flex items-center justify-between px-2 py-1.5">
              <span className={`font-mono text-[11px] ${selected ? "text-acc" : "text-ink3"}`}>
                {p.rotation ? `Page ${p.page} (${p.rotation}deg)` : `Page ${p.page}`}
              </span>
              <span className="flex items-center gap-0.5">
                {allowRotate && (
                  <>
                    <button onClick={() => rotate(idx, -90)} className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-acc focus:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label={`Rotate page ${p.page} left`} title="Rotate left">
                      <RotateCcw size={13} />
                    </button>
                    <button onClick={() => rotate(idx, 90)} className="rounded-sm p-1 text-ink3 hover:bg-elev hover:text-acc focus:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label={`Rotate page ${p.page} right`} title="Rotate right">
                      <RotateCw size={13} />
                    </button>
                  </>
                )}
                {allowDelete && (
                  <button onClick={() => remove(idx)} className="rounded-sm p-1 text-ink3 hover:bg-bad/10 hover:text-bad focus:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label={`Remove page ${p.page}`} title="Remove page">
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </div>

            {selected && (
              <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-sm bg-acc font-mono text-[11px] font-bold text-onAcc">
                ✓
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyGridHint({ children }: { children: React.ReactNode }) {
  return <div className={`${CARD} p-6 text-center text-sm text-ink3`}>{children}</div>;
}
