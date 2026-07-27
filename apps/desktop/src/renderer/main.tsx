import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesktopErrorBoundary } from "./components/DesktopErrorBoundary";
import "./styles.css";
import "./experience.css";
import "./recovery.css";

document.documentElement.dataset.platform = window.doolittle.platform;

const root = document.getElementById("root");
if (!root) throw new Error("Desktop renderer root is missing.");

createRoot(root).render(
  <StrictMode>
    <DesktopErrorBoundary>
      <App />
    </DesktopErrorBoundary>
  </StrictMode>,
);
