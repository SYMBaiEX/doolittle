import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesktopErrorBoundary } from "./components/DesktopErrorBoundary";
import { ElizaUiBridge } from "./ElizaUiBridge";
import "./eliza-tailwind.css";
import "./styles.css";
import "./experience.css";
import "./shell-overlays.css";
import "./recovery.css";
import "./app-polish.css";
import "./eliza-ui.css";
import "./action-motion.css";

document.documentElement.dataset.platform = window.doolittle.platform;

const root = document.getElementById("root");
if (!root) throw new Error("Desktop renderer root is missing.");

createRoot(root).render(
  <StrictMode>
    <DesktopErrorBoundary>
      <ElizaUiBridge>
        <App />
      </ElizaUiBridge>
    </DesktopErrorBoundary>
  </StrictMode>,
);
