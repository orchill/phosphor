import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Combine, FileOutput, FilePlus2, FileStack,
  FolderOutput, History as HistoryIcon, Images, LayoutDashboard, Moon, Scissors,
  Settings as SettingsIcon, ShieldCheck, Sun, Video, X, Zap,
} from "lucide-react";
import { NavContext, ToastContext, Toast, Route, useNav } from "./ctx";
import { systemInfo } from "./api";
import { SystemInfo } from "./types";
import { BTN_GHOST } from "./ui";
import Dashboard from "./pages/Dashboard";
import Merge from "./pages/Merge";
import ImagesToPdf from "./pages/ImagesToPdf";
import Organize from "./pages/Organize";
import Split from "./pages/Split";
import Compress from "./pages/Compress";
import ExtractImages from "./pages/ExtractImages";
import PdfToImages from "./pages/PdfToImages";
import Media from "./pages/Media";
import History from "./pages/History";
import SettingsPage from "./pages/Settings";

// ------------------------------------------------------------------ theme
// Dark-first: the phosphor palette is the intended default experience.
function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem("pms-theme");
    if (saved) return saved === "dark";
    return true;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("pms-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

// ------------------------------------------------------------------ toasts
function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`pointer-events-auto flex items-start gap-2 rounded-md border bg-panel px-3.5 py-3 text-sm text-ink shadow-lg
            ${t.kind === "error" ? "border-bad/50" : t.kind === "success" ? "border-acc/50" : "border-line"}`}
        >
          {t.kind === "error" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
            : t.kind === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-acc" />
            : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info" />}
          <span className="whitespace-pre-wrap">{t.text}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="ml-auto shrink-0 rounded-sm p-0.5 text-ink3 hover:bg-elev hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ nav
const NAV: { id: Route; label: string; icon: React.ElementType; group: string }[] = [
  { id: "dashboard", label: "dashboard", icon: LayoutDashboard, group: "" },
  { id: "merge", label: "merge pdfs", icon: Combine, group: "pdf tools" },
  { id: "images", label: "images to pdf", icon: Images, group: "pdf tools" },
  { id: "organize", label: "organize pages", icon: FileStack, group: "pdf tools" },
  { id: "split", label: "split / extract", icon: Scissors, group: "pdf tools" },
  { id: "compress", label: "compress", icon: Zap, group: "pdf tools" },
  { id: "extract", label: "extract images", icon: FilePlus2, group: "pdf tools" },
  { id: "toimages", label: "pdf to images", icon: FileOutput, group: "pdf tools" },
  { id: "media", label: "media downloader", icon: Video, group: "media" },
  { id: "history", label: "task history", icon: HistoryIcon, group: "system" },
  { id: "settings", label: "settings", icon: SettingsIcon, group: "system" },
];

function Sidebar() {
  const { route, navigate } = useNav();
  let lastGroup = "";
  return (
    <nav
      aria-label="Main navigation"
      className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-panel p-2.5 md:flex"
    >
      {NAV.map((item) => {
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;
        const Icon = item.icon;
        const active = route === item.id;
        return (
          <div key={item.id}>
            {showGroup && item.group && (
              <div className="mb-1 mt-4 px-2 font-mono text-[10px] font-medium uppercase tracking-widest text-ink3">
                {item.group}
              </div>
            )}
            <button
              onClick={() => navigate(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-sm border-l-2 px-2.5 py-1.5 font-mono text-[13px] transition-colors
                ${active
                  ? "border-acc bg-acc/10 text-acc"
                  : "border-transparent text-ink2 hover:bg-elev hover:text-ink"}`}
            >
              <Icon size={15} className="shrink-0" aria-hidden />
              {item.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function MobileNav() {
  const { route, navigate } = useNav();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-2 md:hidden">
      {NAV.map((item) => {
        const active = route === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-mono text-xs
              ${active ? "bg-acc/10 text-acc" : "text-ink2 hover:bg-elev hover:text-ink"}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Header({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    systemInfo().then(setInfo).catch(() => {});
  }, []);
  return (
    <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-acc focus:px-3 focus:py-1.5 focus:font-mono focus:text-[13px] focus:text-onAcc"
      >
        skip to content
      </a>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-acc font-mono text-[15px] font-bold leading-none text-onAcc" aria-hidden>
          ❯
        </div>
        <div>
          <h1 className="font-mono text-sm font-semibold leading-tight tracking-tight text-ink">
            pdf-media-studio<span className="animate-cursor-blink text-acc" aria-hidden>▮</span>
          </h1>
          <p className="text-[11px] leading-tight text-ink3">
            100% local processing - your files never leave this computer
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {info && (
          <button
            onClick={() => navigator.clipboard?.writeText(info.output_dir)}
            title={`Output folder: ${info.output_dir} (click to copy path)`}
            className="hidden items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-mono text-[11px] text-ink3 hover:bg-elev hover:text-ink2 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc lg:flex"
          >
            <FolderOutput size={13} aria-hidden /> {info.output_dir}
          </button>
        )}
        <button
          onClick={toggleTheme}
          className={BTN_GHOST}
          aria-label="Toggle dark mode"
          title="Toggle theme"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ app
export default function App() {
  const { dark, toggle } = useTheme();
  const [route, setRoute] = useState<Route>("dashboard");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-4), { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toastCtx = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  const navCtx = useMemo(() => ({ route, navigate: setRoute }), [route]);

  const page = {
    dashboard: <Dashboard />,
    merge: <Merge />,
    images: <ImagesToPdf />,
    organize: <Organize />,
    split: <Split />,
    compress: <Compress />,
    extract: <ExtractImages />,
    toimages: <PdfToImages />,
    media: <Media />,
    history: <History />,
    settings: <SettingsPage />,
  }[route];

  return (
    <NavContext.Provider value={navCtx}>
      <ToastContext.Provider value={toastCtx}>
        <div className="flex h-screen flex-col">
          <Header dark={dark} toggleTheme={toggle} />
          <MobileNav />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 focus:outline-none">
              <div className="mx-auto max-w-4xl">{page}</div>
            </main>
          </div>
          <ToastHost toasts={toasts} dismiss={dismiss} />
        </div>
      </ToastContext.Provider>
    </NavContext.Provider>
  );
}
