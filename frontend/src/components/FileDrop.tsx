import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { CARD } from "../ui";

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export default function FileDrop({ onFiles, accept, multiple = true, label, hint, disabled }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const label_ = label ?? "Drop files here or click to browse";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      aria-label={label_}
      onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click(); }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); depth.current--; if (depth.current <= 0) { setOver(false); depth.current = 0; } }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFiles(multiple ? files : [files[0]]);
      }}
      className={`${CARD} flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-acc
        ${over ? "border-acc bg-acc/5" : "border-line hover:border-ink3"}
        ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <UploadCloud size={30} className={over ? "text-accText" : "text-ink3"} aria-hidden />
      <p className="text-sm font-medium text-ink2">{label_}</p>
      {hint && <p className="text-xs text-ink3">{hint}</p>}
    </div>
  );
}
