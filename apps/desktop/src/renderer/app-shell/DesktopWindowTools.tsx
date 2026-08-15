import type {
  BackendState,
  DoolittleDesktopBridge,
} from "../../shared/contracts";
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
          <svg
            aria-hidden="true"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 20 20"
          >
            <circle cx="8.5" cy="8.5" r="5" />
            <path d="m12.25 12.25 4 4" />
          </svg>
        ) : (
          <>
            <span>Search or jump to…</span>
            <kbd>{platform === "darwin" ? "⌘K" : "Ctrl K"}</kbd>
          </>
        )}
      </button>
      <button
        aria-label="Open tools and settings"
        aria-expanded={utilityOpen}
        className={WINDOW_UTILITY_BUTTON_CLASS}
        onClick={onToggleUtilities}
        type="button"
      >
        Tools
      </button>
      <div
        className={`${WINDOW_RUNTIME_STATUS_CLASS} ${WINDOW_RUNTIME_STATUS_TONE[backend.phase]}`}
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
        <svg
          aria-hidden="true"
          fill="none"
          viewBox="0 0 20 20"
          stroke="currentColor"
        >
          <path d="M15.5 6.5V3m0 3.5H12M4.7 7.1A6 6 0 0 1 15.5 6.5M4.5 13.5V17m0-3.5H8m7.3-.6A6 6 0 0 1 4.5 13.5" />
        </svg>
      </button>
    </>
  );
}
