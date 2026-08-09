import type {
  BackendState,
  DoolittleDesktopBridge,
} from "../../shared/contracts";

type DesktopPlatform = DoolittleDesktopBridge["platform"];

export interface DesktopWindowToolsProps {
  backend: BackendState;
  platform: DesktopPlatform;
  utilityOpen: boolean;
  onOpenPalette: () => void;
  onToggleUtilities: () => void;
  onRefresh: () => void | Promise<void>;
}

export function DesktopWindowTools({
  backend,
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
        className="window-command-button"
        onClick={onOpenPalette}
        title="Search pages and commands"
        type="button"
      >
        <span>Search or jump to…</span>
        <kbd>{platform === "darwin" ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button
        aria-label="Open tools and settings"
        aria-expanded={utilityOpen}
        className="window-utility-button"
        onClick={onToggleUtilities}
        type="button"
      >
        Tools
      </button>
      <div
        className={`window-runtime-status ${backend.phase}`}
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
        className="icon-button"
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
