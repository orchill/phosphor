import { useEffect } from "react";
import { Combine, FileOutput, FilePlus2, FileStack, Images, Scissors, Zap } from "lucide-react";
import { Route, useNav } from "../ctx";
import { CARD, SECTION_LABEL } from "../ui";
import { Kbd, PageHeader } from "../components/primitives";

interface Tool {
  id: Route;
  icon: React.ElementType;
  title: string;
  desc: string;
}
interface Category {
  title: string;
  blurb: string;
  tools: Tool[];
}

const CATEGORIES: Record<string, Category> = {
  organize: {
    title: "organize",
    blurb: "Put documents in order - combine, cut and rearrange.",
    tools: [
      { id: "merge", icon: Combine, title: "merge pdfs", desc: "Combine multiple PDFs in any order." },
      { id: "split", icon: Scissors, title: "split / extract", desc: "Extract page ranges or split every N pages." },
      { id: "organize", icon: FileStack, title: "organize pages", desc: "Visually reorder, rotate and delete pages." },
    ],
  },
  convert: {
    title: "convert",
    blurb: "Move between documents and images.",
    tools: [
      {
        id: "images",
        icon: Images,
        title: "images to pdf",
        desc: "Turn photos into one PDF with page sizes and margins.",
      },
      { id: "toimages", icon: FileOutput, title: "pdf to images", desc: "Render pages to PNG or JPG at any DPI." },
    ],
  },
  optimize: {
    title: "optimize",
    blurb: "Make documents smaller.",
    tools: [{ id: "compress", icon: Zap, title: "compress pdf", desc: "Shrink file size while balancing quality." }],
  },
  extract: {
    title: "extract",
    blurb: "Get the assets back out.",
    tools: [
      { id: "extract", icon: FilePlus2, title: "extract images", desc: "Export the embedded images from a PDF." },
    ],
  },
};

// Two balanced columns (4 + 3 rows); hint keys are numbered in reading order.
const COLUMNS: Category[][] = [
  [CATEGORIES.organize, CATEGORIES.optimize],
  [CATEGORIES.convert, CATEGORIES.extract],
];
const KEY_ORDER: Tool[] = COLUMNS.flat().flatMap((c) => c.tools);

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export default function PdfTools() {
  const { navigate } = useNav();

  // number keys open the matching tool (the hint chip on each row)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const tool = KEY_ORDER[Number(e.key) - 1];
      if (tool) navigate(tool.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="space-y-5">
      <PageHeader
        route="pdftools"
        description="Every operation writes new files to your output folder - original documents are never modified."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {COLUMNS.map((col, ci) => (
          <div key={ci} className="space-y-4">
            {col.map((cat) => (
              <section key={cat.title} className={`${CARD} overflow-hidden`}>
                <header className="flex items-baseline gap-3 border-b border-line px-4 py-2.5">
                  <h3 className={`${SECTION_LABEL} text-accText`}>{cat.title}</h3>
                  <span className="truncate text-[0.6875rem] text-ink3">{cat.blurb}</span>
                </header>
                <ul className="divide-y divide-line">
                  {cat.tools.map((t) => (
                    <li key={t.id}>
                      <ToolRow tool={t} hint={KEY_ORDER.indexOf(t) + 1} onOpen={() => navigate(t.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}
      </div>
      <p className="font-mono text-[0.6875rem] text-ink3">
        tip: press a number key to open a tool, or <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> to search.
      </p>
    </div>
  );
}

function ToolRow({ tool, hint, onOpen }: { tool: Tool; hint: number; onOpen: () => void }) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elev/60 focus:outline-none focus-visible:bg-elev/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-acc/10 text-accText transition-colors group-hover:bg-acc group-hover:text-onAcc"
        aria-hidden
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-sm font-semibold tracking-tight text-ink">{tool.title}</span>
        <span className="block truncate text-xs text-ink2">{tool.desc}</span>
      </span>
      <Kbd className="shrink-0" aria-hidden>
        {hint}
      </Kbd>
    </button>
  );
}
