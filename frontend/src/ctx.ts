import { createContext, useContext } from "react";

export type Route =
  | "dashboard" | "pdftools"
  | "merge" | "images" | "organize" | "split" | "compress"
  | "extract" | "toimages"
  | "media" | "history" | "settings";

/** Routes that live under the PDF Tools area (landing + individual tools). */
export const PDF_ROUTES: Route[] = [
  "pdftools", "merge", "images", "organize", "split", "compress", "extract", "toimages",
];

/** Breadcrumb/page metadata per route (rendered by the app shell). */
export const ROUTE_META: Record<Route, { crumb: string; title: string }> = {
  dashboard: { crumb: "~/home", title: "Home" },
  pdftools: { crumb: "~/pdf-tools", title: "PDF Tools" },
  merge: { crumb: "~/pdf-tools/merge", title: "Merge PDFs" },
  images: { crumb: "~/pdf-tools/images-to-pdf", title: "Images to PDF" },
  organize: { crumb: "~/pdf-tools/organize", title: "Organize Pages" },
  split: { crumb: "~/pdf-tools/split", title: "Split / Extract" },
  compress: { crumb: "~/pdf-tools/compress", title: "Compress PDF" },
  extract: { crumb: "~/pdf-tools/extract-images", title: "Extract Images" },
  toimages: { crumb: "~/pdf-tools/pdf-to-images", title: "PDF to Images" },
  media: { crumb: "~/media", title: "Media Downloader" },
  history: { crumb: "~/history", title: "Task History" },
  settings: { crumb: "~/settings", title: "Settings" },
};

export const NavContext = createContext<{
  route: Route;
  navigate: (r: Route) => void;
}>({ route: "dashboard", navigate: () => {} });

export const useNav = () => useContext(NavContext);

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export const ToastContext = createContext<{
  toasts: Toast[];
  push: (kind: Toast["kind"], text: string) => void;
  dismiss: (id: number) => void;
}>({ toasts: [], push: () => {}, dismiss: () => {} });

export const useToast = () => useContext(ToastContext);
