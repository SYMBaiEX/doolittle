import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesktopErrorBoundary } from "./components/DesktopErrorBoundary";
import {
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopFoundationTokens,
  applyDesktopTheme,
  loadAppearancePreference,
  loadDensityPreference,
  loadStoredDesktopTheme,
} from "./desktop-theme";
import { ElizaUiBridge } from "./ElizaUiBridge";
import "./eliza-tailwind.css";

document.documentElement.dataset.platform = window.doolittle.platform;
applyDesktopFoundationTokens();
applyDesktopAppearance(loadAppearancePreference());
applyDesktopDensity(loadDensityPreference());
const storedTheme = loadStoredDesktopTheme();
if (storedTheme) applyDesktopTheme(storedTheme);

document.documentElement.classList.add("h-full", "w-full", "overflow-hidden");
document.body.classList.add(
  "m-0",
  "h-full",
  "w-full",
  "overflow-hidden",
  "bg-[var(--bg)]",
  "font-[var(--font-sans)]",
  "text-[var(--text)]",
  "antialiased",
);

const root = document.getElementById("root");
if (!root) throw new Error("Desktop renderer root is missing.");
root.classList.add("h-full", "w-full", "overflow-hidden");

createRoot(root).render(
  <StrictMode>
    <DesktopErrorBoundary>
      <ElizaUiBridge>
        <App />
      </ElizaUiBridge>
    </DesktopErrorBoundary>
  </StrictMode>,
);
