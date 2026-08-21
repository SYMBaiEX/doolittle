import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import type {
  BackendState,
  DoolittleDesktopBridge,
} from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import {
  ICON_BUTTON_CLASS,
  WINDOW_COMMAND_BUTTON_CLASS,
  WINDOW_COMMAND_BUTTON_COMPACT_CLASS,
  WINDOW_RUNTIME_STATUS_CLASS,
  WINDOW_RUNTIME_STATUS_TONE,
  WINDOW_UTILITY_BUTTON_CLASS,
} from "./shell-layout";

type DesktopPlatform = DoolittleDesktopBridge["platform"];

export interface DesktopWindowToolsProps {
  backend: BackendState;
  platform: DesktopPlatform;
  utilityOpen: boolean;
  compactCommand?: boolean;
  onOpenPalette: () => void;
  onToggleUtilities: () => void;
  onRefresh: () => void | Promise<void>;
}

export function DesktopWindowTools({
  backend,
  compactCommand = false,
  platform,
  utilityOpen,
  onOpenPalette,
  onToggleUtilities,
  onRefresh,
}: DesktopWindowToolsProps) {
  return (
    <>
      <button
        aria-label="Open command palette"
        className={`${WINDOW_COMMAND_BUTTON_CLASS}${
          compactCommand ? ` ${WINDOW_COMMAND_BUTTON_COMPACT_CLASS}` : ""
        }`}
        onClick={onOpenPalette}
        title="Search pages and commands"
        type="button"
      >
        {compactCommand ? (
          <UiIcon icon={Search} size="sm" />
        ) : (
          <>
            <span>Search or jump to…</span>
            <kbd>{platform === "darwin" ? "⌘K" : "Ctrl K"}</kbd>
          </>
        )}
      </button>
      <button
        aria-label={`${utilityOpen ? "Close" : "Open"} tools and settings`}
        aria-expanded={utilityOpen}
        className={WINDOW_UTILITY_BUTTON_CLASS}
        onClick={onToggleUtilities}
        title={`${utilityOpen ? "Close" : "Open"} tools and settings`}
        type="button"
      >
        <UiIcon icon={SlidersHorizontal} size="sm" />
        <span>Tools</span>
      </button>
      <div
        aria-label={`Runtime status: ${
          backend.phase === "ready"
            ? "ready"
            : backend.phase === "booting"
              ? "starting"
              : "offline"
        }`}
        aria-live="polite"
        className={`${WINDOW_RUNTIME_STATUS_CLASS} ${WINDOW_RUNTIME_STATUS_TONE[backend.phase]}`}
        role="status"
        title={backend.message}
      >
        <i />
        <span>
          {backend.phase === "ready"
            ? "Local runtime"
            : backend.phase === "booting"
              ? "Starting"
              : "Offline"}
        </span>
      </div>
      <button
        aria-label="Refresh runtime data"
        className={ICON_BUTTON_CLASS}
        onClick={onRefresh}
        title="Refresh runtime"
        type="button"
      >
        <UiIcon icon={RefreshCw} size="sm" />
      </button>
    </>
  );
}
