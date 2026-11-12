import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Combine, FileOutput, FilePlus2,
  FileStack, FolderOutput, History as HistoryIcon, Images, LayoutDashboard, Moon,
  Scissors, Search, Settings as SettingsIcon, ShieldCheck, Sun, Video, X, Zap,
} from "lucide-react";
import { NavContext, ToastContext, Toast, Route, useNav, PDF_ROUTES, ROUTE_META } from "./ctx";
import { systemInfo } from "./api";
import { SystemInfo } from "./types";
import { BTN_GHOST } from "./ui";
import { DENSITY_KEY, applyDensity, readTheme, saveTheme } from "./appearance";
import CommandPalette from "./components/CommandPalette";
import Onboarding from "./components/Onboarding";
import { Kbd } from "./components/primitives";
import Dashboard from "./pages/Dashboard";
import PdfTools from "./pages/PdfTools";
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

// ------------------------------------------------------------------ routing
// Hash-based routes survive reloads, support deep links and back/forward.
const ROUTE_FOR_HASH: Record<string, Route> = {
  "": "dashboard", "pdf": "pdftools", "pdf/merge": "merge", "pdf/images": "images",
  "pdf/organize": "organize", "pdf/split": "split", "pdf/compress": "compress",
  "pdf/extract": "extract", "pdf/toimages": "toimages", "media": "media",
  "history": "history", "settings": "settings",
};
const HASH_FOR_ROUTE: Record<Route, string> = {
  dashboard: "", pdftools: "pdf", merge: "pdf/merge", images: "pdf/images",
  organize: "pdf/organize", split: "pdf/split", compress: "pdf/compress",
  extract: "pdf/extract", toimages: "pdf/toimages", media: "media",
  history: "history", settings: "settings",
};

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "").replace(/\/+$/, "");
  return ROUTE_FOR_HASH[h] ?? "dashboard";
}

// ------------------------------------------------------------------ density
// Interface density: root font-size scaling (rem-based layout follows).
function useDensity() {
  useEffect(() => {
    const sync = () => applyDensity();
    sync();
    window.addEventListener(DENSITY_KEY, sync);
    return () => window.removeEventListener(DENSITY_KEY, sync);
  }, []);
}

// --------------------------------------------------------- document title
let BASE_TITLE = "phosphor";
function setBaseTitle(t: string) {
  BASE_TITLE = t;
  document.title = t;
}

// ------------------------------------------------------------------ theme
// Dark-first: the phosphor palette is the intended default experience. The
// class is already set before first paint (main.tsx / theme-init.js); this
// hook only keeps React state and storage in sync afterwards.
function useTheme() {
  const [dark, setDark] = useState<boolean>(() => readTheme() === "dark");
  useEffect(() => {
    saveTheme(dark ? "dark" : "light");
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
          className={`pointer-events-none flex items-start gap-2 rounded border bg-panel px-3.5 py-3 text-sm text-ink shadow-lg
            ${t.kind === "error" ? "border-bad/50" : t.kind === "success" ? "border-acc/50" : "border-line"}`}
        >
          {t.kind === "error" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
            : t.kind === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accText" />
            : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info" />}
          <span className="whitespace-pre-wrap">{t.text}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="pointer-events-auto ml-auto shrink-0 rounded-sm p-0.5 text-ink3 hover:bg-elev hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ nav
const PDF_TOOLS_NAV: { id: Route; label: string; icon: React.ElementType }[] = [
  { id: "merge", label: "merge pdfs", icon: Combine },
  { id: "images", label: "images to pdf", icon: Images },
  { id: "organize", label: "organize pages", icon: FileStack },
  { id: "split", label: "split / extract", icon: Scissors },
  { id: "compress", label: "compress", icon: Zap },
  { id: "extract", label: "extract images", icon: FilePlus2 },
  { id: "toimages", label: "pdf to images", icon: FileOutput },
];

function NavItem({ id, label, icon: Icon, active, onClick }: {
  id: string; label: string; icon?: React.ElementType; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-sm border-l-2 px-2.5 py-1.5 font-mono text-sm transition-colors
        ${active
          ? "glow border-acc bg-acc/10 text-accText"
          : "border-transparent text-ink3 hover:bg-elev hover:text-ink"}`}
    >
      {Icon && <Icon size={15} className="shrink-0" aria-hidden />}
      {label}
    </button>
  );
}

function GroupHeader({ label, onClick, expanded, collapsible }: {
  label: string; onClick?: (toggleOnly?: boolean) => void; expanded?: boolean; collapsible?: boolean;
}) {
  const cls =
    "mb-1 mt-4 flex w-full items-center px-2 font-mono text-[0.625rem] font-medium uppercase tracking-widest text-ink3";
  if (!collapsible) {
    return <div className={cls}>{label}</div>;
  }
  return (
    <span className={`${cls} py-0.5`}>
      <button
        onClick={() => onClick?.(false)}
        className="rounded-sm hover:text-ink2 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {label}
      </button>
      <button
        onClick={() => onClick?.(true)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${label} section`}
        className="ml-auto rounded-sm p-0.5 hover:text-ink2 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        <ChevronDown
          size={13}
          className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>
    </span>
  );
}

function Sidebar() {
  const { route, navigate } = useNav();
  const pdfActive = PDF_ROUTES.includes(route);
  const [pdfOpen, setPdfOpen] = useState(pdfActive);
  useEffect(() => { if (pdfActive) setPdfOpen(true); }, [pdfActive]);

  return (
    <nav
      aria-label="Main navigation"
      className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-panel p-2.5 md:flex"
    >
      <NavItem
        id="dashboard" label="home" icon={LayoutDashboard}
        active={route === "dashboard"} onClick={() => navigate("dashboard")}
      />

      <GroupHeader
        label="pdf tools" collapsible expanded={pdfOpen}
        onClick={(toggleOnly?: boolean) => {
          if (toggleOnly) setPdfOpen((o) => !o);
          else { navigate("pdftools"); setPdfOpen(true); }
        }}
      />
      {pdfOpen && PDF_TOOLS_NAV.map((item) => (
        <NavItem
          key={item.id} {...item}
          active={route === item.id} onClick={() => navigate(item.id)}
        />
      ))}

      <GroupHeader label="media" />
      <NavItem
        id="media" label="media downloader" icon={Video}
        active={route === "media"} onClick={() => navigate("media")}
      />

      <GroupHeader label="system" />
      <NavItem
        id="history" label="task history" icon={HistoryIcon}
        active={route === "history"} onClick={() => navigate("history")}
      />
      <NavItem
        id="settings" label="settings" icon={SettingsIcon}
        active={route === "settings"} onClick={() => navigate("settings")}
      />
    </nav>
  );
}

function MobileNav() {
  const { route, navigate } = useNav();
  const items: { id: Route; label: string }[] = [
    { id: "dashboard", label: "home" },
    { id: "pdftools", label: "pdf tools" },
    { id: "merge", label: "merge" },
    { id: "images", label: "images" },
    { id: "organize", label: "organize" },
    { id: "split", label: "split" },
    { id: "compress", label: "compress" },
    { id: "extract", label: "extract" },
    { id: "toimages", label: "to images" },
    { id: "media", label: "media" },
    { id: "history", label: "history" },
    { id: "settings", label: "settings" },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-2 md:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => navigate(item.id)}
          aria-current={route === item.id ? "page" : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-mono text-xs
            ${route === item.id ? "bg-acc/10 text-accText" : "text-ink2 hover:bg-elev hover:text-ink"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Header({ dark, toggleTheme, openPalette }: { dark: boolean; toggleTheme: () => void; openPalette: () => void }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    systemInfo().then(setInfo).catch(() => {});
  }, []);
  return (
    <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-acc focus:px-3 focus:py-1.5 focus:font-mono focus:text-sm focus:text-onAcc"
      >
        skip to content
      </a>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-acc font-mono text-[0.9375rem] font-bold leading-none text-onAcc" aria-hidden>
          ❯
        </div>
        <div>
          <h1 className="glow font-mono text-sm font-semibold leading-tight tracking-tight text-ink">
            phosphor<span className="animate-cursor-blink text-accText" aria-hidden>▮</span>
          </h1>
          <p className="text-[0.6875rem] leading-tight text-ink3">
            local PDF &amp; media console - nothing leaves this computer
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {info && (
          <button
            onClick={() => navigator.clipboard?.writeText(info.output_dir)}
            title={`Output folder: ${info.output_dir} (click to copy path)`}
            className="hidden items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-mono text-[0.6875rem] text-ink3 hover:bg-elev hover:text-ink2 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc lg:flex"
          >
            <FolderOutput size={13} aria-hidden /> {info.output_dir}
          </button>
        )}
        <button
          onClick={openPalette}
          className={`${BTN_GHOST} hidden items-center gap-1.5 px-2 font-mono text-[0.6875rem] sm:inline-flex`}
          aria-label="Open command palette"
          title="Command palette (Ctrl+K)"
        >
          <Search size={14} aria-hidden />
          <span className="hidden items-center gap-1 lg:inline-flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
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
  useDensity();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(
    () => !localStorage.getItem("pms-onboarded-v1"),
  );
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const showIntro = () => {
      localStorage.removeItem("pms-onboarded-v1");
      setIntroOpen(true);
    };
    window.addEventListener("pms-show-intro", showIntro);
    return () => window.removeEventListener("pms-show-intro", showIntro);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!window.location.hash) history.replaceState(null, "", "#/");
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    setBaseTitle(`${ROUTE_META[route].title} · phosphor`);
  }, [route]);

  const navigate = useCallback((r: Route) => {
    const target = `#/${HASH_FOR_ROUTE[r]}`;
    if (window.location.hash === target) setRoute(r);
    else window.location.hash = target;
  }, []);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-4), { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toastCtx = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  const navCtx = useMemo(() => ({ route, navigate }), [route, navigate]);

  const page = {
    dashboard: <Dashboard />,
    pdftools: <PdfTools />,
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
          <Header dark={dark} toggleTheme={toggle} openPalette={() => setPaletteOpen(true)} />
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            toggleTheme={toggle}
            dark={dark}
          />
          <Onboarding
            open={introOpen}
            onClose={() => {
              localStorage.setItem("pms-onboarded-v1", "1");
              setIntroOpen(false);
            }}
          />
          <MobileNav />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 focus:outline-none">
              <div className="mx-auto max-w-4xl">
                {page}
              </div>
            </main>
          </div>
          <ToastHost toasts={toasts} dismiss={dismiss} />
        </div>
      </ToastContext.Provider>
    </NavContext.Provider>
  );
}
