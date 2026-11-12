import { createContext, useContext } from "react";

export type Route =
  | "dashboard"
  | "pdftools"
  | "merge"
  | "images"
  | "organize"
  | "split"
  | "compress"
  | "extract"
  | "toimages"
  | "media"
  | "history"
  | "settings";

/** Routes that live under the PDF Tools area (landing + individual tools). */
export const PDF_ROUTES: Route[] = [
  "pdftools",
  "merge",
  "images",
  "organize",
  "split",
  "compress",
  "extract",
  "toimages",
];

/** Breadcrumb/page metadata per route (rendered by the app shell). */
export const ROUTE_META: Record<Route, { crumb: string; title: string }> = {
  dashboard: { crumb: "~/home", title: "home" },
  pdftools: { crumb: "~/pdf-tools", title: "pdf tools" },
  merge: { crumb: "~/pdf-tools/merge", title: "merge pdfs" },
  images: { crumb: "~/pdf-tools/images-to-pdf", title: "images to pdf" },
  organize: { crumb: "~/pdf-tools/organize", title: "organize pages" },
  split: { crumb: "~/pdf-tools/split", title: "split / extract" },
  compress: { crumb: "~/pdf-tools/compress", title: "compress pdf" },
  extract: { crumb: "~/pdf-tools/extract-images", title: "extract images" },
  toimages: { crumb: "~/pdf-tools/pdf-to-images", title: "pdf to images" },
  media: { crumb: "~/media", title: "media downloader" },
  history: { crumb: "~/history", title: "task history" },
  settings: { crumb: "~/settings", title: "settings" },
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
