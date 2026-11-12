import {
  Combine, FileOutput, FilePlus2, FileStack, Images, Scissors, Zap,
} from "lucide-react";
import ToolCard from "../components/ToolCard";
import { SECTION_TITLE } from "../ui";
import { PageHeader } from "../components/primitives";

const CATEGORIES: { title: string; blurb: string; tools: { id: string; icon: React.ElementType; title: string; desc: string }[] }[] = [
  {
    title: "organize",
    blurb: "Put documents in order - combine, cut and rearrange.",
    tools: [
      { id: "merge", icon: Combine, title: "Merge PDFs", desc: "Combine multiple PDFs in any order." },
      { id: "split", icon: Scissors, title: "Split / Extract", desc: "Extract page ranges or split every N pages." },
      { id: "organize", icon: FileStack, title: "Organize Pages", desc: "Visually reorder, rotate and delete pages." },
    ],
  },
  {
    title: "convert",
    blurb: "Move between documents and images.",
    tools: [
      { id: "images", icon: Images, title: "Images to PDF", desc: "Turn photos into one PDF with page sizes, margins and rotation." },
      { id: "toimages", icon: FileOutput, title: "PDF to Images", desc: "Render pages to PNG or JPG at any DPI." },
    ],
  },
  {
    title: "optimize",
    blurb: "Make documents smaller.",
    tools: [
      { id: "compress", icon: Zap, title: "Compress PDF", desc: "Shrink file size while balancing quality." },
    ],
  },
  {
    title: "extract",
    blurb: "Get the assets back out.",
    tools: [
      { id: "extract", icon: FilePlus2, title: "Extract Images", desc: "Export the embedded images from a PDF." },
    ],
  },
];

export default function PdfTools() {
  return (
    <div className="space-y-6">
      <PageHeader
        route="pdftools"
        description="Every operation writes new files to your output folder - original documents are never modified."
      />

      {CATEGORIES.map((cat) => (
        <section key={cat.title}>
          <div className="mb-3 flex items-baseline gap-3">
            <h3 className={`${SECTION_TITLE} text-accText`}>{cat.title}</h3>
            <span className="hidden text-xs text-ink3 sm:block">{cat.blurb}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cat.tools.map((t) => (
              <ToolCard key={t.id} {...t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
