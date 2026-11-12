import { useEffect, useState } from "react";
import { FileStack, RotateCcw, RotateCw, Save, Trash2 } from "lucide-react";
import FileDrop from "../components/FileDrop";
import PageGrid, { PageState } from "../components/PageGrid";
import SourcePanel from "../components/SourcePanel";
import TaskPanel from "../components/TaskPanel";
import { deleteFile, opEditPages, uploadFiles } from "../api";
import { useToast } from "../ctx";
import { UploadedFile } from "../types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from "../ui";
import { PageHeader } from "../components/primitives";

export default function Organize() {
  const [pdf, setPdf] = useState<UploadedFile | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [outName, setOutName] = useState("");
  const [busy, setBusy] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (pdf) {
      setPages(Array.from({ length: pdf.pages }, (_, i) => ({ page: i + 1, rotation: 0 })));
      setSelection(new Set());
      setOutName(`${pdf.name}_edited`);
    }
  }, [pdf]);

  const load = async (files: File[]) => {
    const pdfFile = files.find((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!pdfFile) {
      toast.push("error", "Drop a single PDF to organize its pages.");
      return;
    }
    setBusy(true);
    try {
      const [meta] = await uploadFiles([pdfFile]);
      setPdf(meta);
      toast.push("success", `${meta.name}: ${meta.pages} pages loaded.`);
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setBusy(false);
    }
  };

  const rotateSelected = (delta: number) => {
    const next = [...pages];
    next.forEach((p, i) => {
      if (selection.has(p.page)) next[i] = { ...p, rotation: (p.rotation + delta + 360) % 360 };
    });
    setPages(next);
  };

  const deleteSelected = () => {
    setPages((ps) => ps.filter((p) => !selection.has(p.page)));
    setSelection(new Set());
  };

  const rotateAll = (delta: number) => {
    setPages((ps) => ps.map((p) => ({ ...p, rotation: (p.rotation + delta + 360) % 360 })));
  };

  const save = async () => {
    if (!pdf || pages.length === 0) return;
    setBusy(true);
    try {
      const rotateMap: Record<string, number> = {};
      pages.forEach((p) => { if (p.rotation) rotateMap[String(p.page)] = p.rotation; });
      const { task_id } = await opEditPages({
        file_id: pdf.id,
        order: pages.map((p) => p.page),
        rotate: rotateMap,
        output_name: outName || null,
      });
      setTaskId(task_id);
      toast.push("info", "Processing pages...");
    } catch (e: any) {
      toast.push("error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        route="organize"
        description={<>
          Drag pages to reorder, rotate or remove individual pages, or select several at once.
          Saving produces a new PDF; the source file stays untouched.
        </>}
      />

      {!pdf && <FileDrop onFiles={load} accept=".pdf,application/pdf" multiple={false} label="Drop a PDF to organize" hint="Pages appear as thumbnails" disabled={busy} />}

      {pdf && (
        <>
          <SourcePanel file={pdf} onClose={() => { setPdf(null); deleteFile(pdf.id).catch(() => {}); }} closeLabel="Close document" />
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel p-3">
            <span className="font-mono text-[0.75rem] text-ink2">{pages.length} page(s)</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button onClick={() => setSelection(new Set(pages.map((p) => p.page)))} className={BTN_SECONDARY}>Select all</button>
              <button onClick={() => setSelection(new Set())} className={BTN_SECONDARY}>Select none</button>
              <button onClick={() => rotateSelected(-90)} disabled={!selection.size} className={BTN_SECONDARY}><RotateCcw size={14} /> Rotate selected</button>
              <button onClick={() => rotateSelected(90)} disabled={!selection.size} className={BTN_SECONDARY}><RotateCw size={14} /> Rotate selected</button>
              <button onClick={deleteSelected} disabled={!selection.size} className={BTN_DANGER}>
                <Trash2 size={14} /> Delete selected
</button>
              <button onClick={() => rotateAll(90)} className={BTN_SECONDARY}>Rotate all +90</button>
            </span>
          </div>

          {pages.length === 0 ? (
            <p className="rounded-sm border border-dashed border-line p-8 text-center text-sm text-ink2 ">
              All pages removed - add pages back by reloading the file.
            </p>
          ) : (
            <PageGrid
fileId={pdf.id}
              pages={pages}
              setPages={setPages}
              selection={selection}
              setSelection={setSelection}
              allowReorder
allowRotate
allowDelete
allowSelect
/>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <label className={LABEL} htmlFor="outname">Output filename</label>
              <input id="outname" value={outName} onChange={(e) => setOutName(e.target.value)} className={`${INPUT} mt-1`} />
            </div>
            <button onClick={save} disabled={busy || !pages.length} className={BTN_PRIMARY}>
              <Save size={16} /> Save as new PDF
            </button>
          </div>
        </>
      )}

      <TaskPanel taskId={taskId} onDismiss={() => setTaskId(null)} onRetry={save} />
    </div>
  );
}
