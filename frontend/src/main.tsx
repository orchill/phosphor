import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyStoredAppearance } from "./appearance";
import "./index.css";

// Before the first render: no flash of the wrong theme (B16).
applyStoredAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
