import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../hooks";
import {
  Combine, FileOutput, FilePlus2, FileStack, FolderOutput, History as HistoryIcon,
  Images, LayoutDashboard, Moon, Scissors, Search, Settings as SettingsIcon,
  Sun, Video, Zap,
} from "lucide-react";
import { ROUTE_META, Route, useNav } from "../ctx";
import { openOutputFolder } from "../api";
import { useToast } from "../ctx";

interface Command {
  id: string;
  label: string;
  section: "navigate" | "actions";
  icon: React.ElementType;
  keywords: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  toggleTheme: () => void;
  dark: boolean;
}

/** Ctrl+K command palette. Navigates the existing router and runs a few
 *  genuine actions; keyboard-first with ARIA listbox semantics. */
export default function CommandPalette({ open, onClose, toggleTheme, dark }: Props) {
  const { navigate } = useNav();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const commands = useMemo<Command[]>(() => {
    const routeCmd = (r: Route, label: string, icon: React.ElementType): Command => ({
      id: `route:${r}`, label, section: "navigate", icon,
      keywords: ROUTE_META[r].crumb, run: () => navigate(r),
    });
    return [
      routeCmd("dashboard", "home", LayoutDashboard),
      routeCmd("pdftools", "pdf tools overview", FileStack),
      routeCmd("merge", "merge pdfs", Combine),
      routeCmd("images", "images to pdf", Images),
      routeCmd("organize", "organize pages", FileStack),
      routeCmd("split", "split / extract", Scissors),
      routeCmd("compress", "compress pdf", Zap),
      routeCmd("extract", "extract images", FilePlus2),
      routeCmd("toimages", "pdf to images", FileOutput),
      routeCmd("media", "media downloader", Video),
      routeCmd("history", "task history", HistoryIcon),
      routeCmd("settings", "settings", SettingsIcon),
      {
        id: "action:theme", label: dark ? "switch to light theme" : "switch to dark theme",
        section: "actions", icon: dark ? Sun : Moon, keywords: "theme dark light appearance",
        run: () => { toggleTheme(); },
      },
      {
        id: "action:output", label: "open output folder", section: "actions",
        icon: FolderOutput, keywords: "output folder open files",
        run: () => { openOutputFolder().catch((e) => toast.push("error", e.message)); },
      },
    ];
  }, [navigate, toggleTheme, toast, dark]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // defer so the input exists before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  if (!open) return null;

  const runCommand = (cmd: Command | undefined) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runCommand(results[active]); }
  };

  let lastSection = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg rounded border border-line bg-panel shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
          <Search size={15} className="shrink-0 text-ink3" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-label="Search commands"
            placeholder="Type a command or page name…"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent font-mono text-sm text-ink placeholder:text-ink3 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[0.625rem] text-ink3">
            esc
          </kbd>
        </div>
        <div ref={listRef} id="command-palette-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-2 py-6 text-center font-mono text-[0.75rem] text-ink3">No matching commands.</p>
          )}
          {results.map((cmd, i) => {
            const showSection = cmd.section !== lastSection;
            lastSection = cmd.section;
            const Icon = cmd.icon;
            return (
              <div key={cmd.id}>
                {showSection && (
                  <div className="px-2 pb-1 pt-2 font-mono text-[0.625rem] uppercase tracking-widest text-ink3">
                    {cmd.section === "navigate" ? "go to" : "actions"}
                  </div>
                )}
                <button
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runCommand(cmd)}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left font-mono text-sm transition-colors ${
                    i === active ? "bg-acc/10 text-accText" : "text-ink2"
                  }`}
                >
                  <Icon size={15} className="shrink-0" aria-hidden />
                  {cmd.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
