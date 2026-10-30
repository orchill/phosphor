import { FileText, GripVertical, Image as ImageIcon, X } from "lucide-react";
import { thumbUrl } from "../api";
import { UploadedFile, humanSize } from "../types";

interface Props {
  file: UploadedFile;
  onRemove?: () => void;
  draggable?: boolean;
  index?: number;
  badge?: string;
}

export default function FileCard({ file, onRemove, draggable, index, badge }: Props) {
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        (e.currentTarget as HTMLElement).dataset.index = String(index);
      }}
      onDragOver={(e) => e.preventDefault()}
      className="flex items-center gap-3 rounded-md border border-line bg-panel p-2.5"
    >
      {draggable && (
        <span className="cursor-grab text-ink3" title="Drag to reorder" aria-hidden>
          <GripVertical size={16} />
        </span>
      )}
      {file.kind === "pdf" ? (
        <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-elev">
          <img src={thumbUrl(file.id, 120)} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-elev">
          <img src={thumbUrl(file.id, 120)} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] font-medium text-ink">{file.name}</p>
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-ink3">
          {file.kind === "pdf" ? <FileText size={11} /> : <ImageIcon size={11} />}
          {file.kind.toUpperCase()} - {humanSize(file.size)}
          {file.kind === "pdf" && ` - ${file.pages} pages`}
          {file.kind === "image" && file.width ? ` - ${file.width}x${file.height}` : ""}
          {badge && <span className="ml-1 rounded-sm bg-acc/10 px-1.5 py-0.5 text-[10px] font-semibold text-acc">{badge}</span>}
        </p>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="rounded-sm p-1.5 text-ink3 hover:bg-bad/10 hover:text-bad focus:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label={`Remove ${file.name}`}>
          <X size={15} />
        </button>
      )}
    </li>
  );
}
