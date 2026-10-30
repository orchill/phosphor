import { useNav } from "../ctx";
import { CARD } from "../ui";

interface Props {
  id: string;
  icon: React.ElementType;
  title: string;
  desc: string;
}

/** Shared tool card used on the Home dashboard and the PDF Tools landing page. */
export default function ToolCard({ id, icon: Icon, title, desc }: Props) {
  const { navigate } = useNav();
  return (
    <button
      onClick={() => navigate(id as any)}
      className={`${CARD} group flex items-start gap-3 p-4 text-left transition-colors hover:border-acc/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-acc/10 text-acc transition-colors group-hover:bg-acc group-hover:text-onAcc"
        aria-hidden
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[13px] font-semibold tracking-tight text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink2">{desc}</span>
      </span>
    </button>
  );
}
