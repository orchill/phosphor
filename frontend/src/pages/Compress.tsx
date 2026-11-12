import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import FileDrop from "../components/FileDrop";
import OptionCard from "../components/OptionCard";
import SourcePanel from "../components/SourcePanel";
import TaskPanel from "../components/TaskPanel";
import { deleteFile, opCompress, uploadFiles } from "../api";
import { useToast } from "../ctx";
import { UploadedFile, humanSize } from "../types";
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "../ui";
import { PageHeader } from "../components/primitives";

const PRESETS = [
  { id: "high", label: "High quality", quality: 80, dpi: 150, desc: "Crisp images, moderate saving" },
  { id: "balanced", label: "Balanced", quality: 62, dpi: 120, desc: "Good default for sharing" },
  { id: "aggressive", label: "Aggressive", quality: 42, dpi: 90, desc: "Smallest files, visible softening" },
  { id: "custom", label: "Custom", quality: 60, dpi: 120, desc: "Tune quality and DPI manually" },
];

export default function Compress() {
  const [pdf, setPdf] = useState<UploadedFile | null>(null);
  const [preset, setPreset] = useState("balanced");
  const [quality, setQuality] = useState(62);
  const [dpi, setDpi] = useState(120);
  const [busy, setBusy] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const p = PRESETS.find((p) => p.id === preset);
    if (p && preset !== "custom") {
      setQuality(p.quality);
      setDpi(p.dpi);
    }
  }, [preset]);

  const load = async (files: File[]) => {
    const f = files.find((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!f) {
      toast.push("error", "Drop a single PDF.");
      return;
    }
    setBusy(true);
    try {
      const [meta] = await uploadFiles([f]);
      setPdf(meta);
      setTaskId(null);
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    try {
      const { task_id } = await opCompress({ file_id: pdf.id, quality, dpi_cap: dpi });
      setTaskId(task_id);
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        route="compress"
        description={
          <>
            Downscales oversized embedded images and re-encodes them as JPEG. The tool reports the real output size
            after processing; if the file is already optimized, the original is kept.
          </>
        }
      />

      {!pdf && (
        <FileDrop
          onFiles={load}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF to compress"
          hint={pdf ? undefined : "Image-heavy documents shrink the most"}
          disabled={busy}
        />
      )}

      {pdf && (
        <>
          <SourcePanel
            file={pdf}
            onClose={() => {
              setPdf(null);
              deleteFile(pdf.id).catch(() => {});
            }}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((p) => (
                <OptionCard
                  key={p.id}
                  name="preset"
                  checked={preset === p.id}
                  onChange={() => setPreset(p.id)}
                  label={p.label}
                  desc={p.desc}
                />
              ))}
            </div>
            {preset === "custom" && (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-ink2" htmlFor="cq">
                  JPEG quality: {quality}
                  <input
                    id="cq"
                    type="range"
                    min={20}
                    max={95}
                    value={quality}
                    onChange={(e) => setQuality(+e.target.value)}
                    className="ml-3 w-56 accent-acc"
                  />
                </label>
                <label className="block text-xs text-ink2" htmlFor="cdpi">
                  Max image DPI: {dpi}
                  <input
                    id="cdpi"
                    type="range"
                    min={60}
                    max={250}
                    step={10}
                    value={dpi}
                    onChange={(e) => setDpi(+e.target.value)}
                    className="ml-3 w-56 accent-acc"
                  />
                </label>
              </div>
            )}
          </SourcePanel>

          <div className="flex items-center gap-3">
            <button onClick={run} disabled={busy} className={BTN_PRIMARY}>
              <Zap size={16} /> compress
            </button>
          </div>
        </>
      )}

      <TaskPanel taskId={taskId} onDismiss={() => setTaskId(null)} onRetry={run} />
    </div>
  );
}
