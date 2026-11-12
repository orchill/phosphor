import { X } from "lucide-react";
import { UploadedFile, humanSize } from "../types";
import { BTN_GHOST, CARD, SECTION_LABEL } from "../ui";

interface Props {
  file: UploadedFile;
  onClose: () => void;
  closeLabel?: string;
  children?: React.ReactNode;
}

/** Structured "source" section for single-file PDF tool layouts: monospace
 *  file metadata (name, size, pages / dimensions) plus a close action, with
 *  the operation's config controls as children. */
export default function SourcePanel({ file, onClose, closeLabel = "Close file", children }: Props) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className={SECTION_LABEL}>source</h4>
        <button onClick={onClose} className={`${BTN_GHOST} px-2 py-1 text-xs`}>
          <X size={13} aria-hidden /> {closeLabel}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.75rem]">
        <span className="min-w-0 max-w-full truncate text-ink" title={file.name}>
          {file.name}
        </span>
        <span className="text-ink3" aria-hidden>
          ·
        </span>
        <span className="text-ink3">{humanSize(file.size)}</span>
        {file.kind === "pdf" && (
          <>
            <span className="text-ink3" aria-hidden>
              ·
            </span>
            <span className="text-ink3">{file.pages} pages</span>
          </>
        )}
        {file.kind === "image" && file.width != null && (
          <>
            <span className="text-ink3" aria-hidden>
              ·
            </span>
            <span className="text-ink3">
              {file.width}×{file.height} {file.format}
            </span>
          </>
        )}
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  );
}
