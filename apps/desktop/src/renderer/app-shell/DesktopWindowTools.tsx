import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@elizaos/ui/dropdown-menu";
import {
  Activity,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { useRef } from "react";
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
  onOpenSettings: () => void;
  onToggleUtilities: () => void;
  onRefresh: () => void | Promise<void>;
}

export function DesktopWindowTools({
  backend,
  compactCommand = false,
  platform,
  utilityOpen,
  onOpenPalette,
  onOpenSettings,
  onToggleUtilities,
  onRefresh,
}: DesktopWindowToolsProps) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const pendingMenuAction = useRef<(() => void | Promise<void>) | null>(null);
  const runMenuAction = (action: () => void | Promise<void>) => {
    pendingMenuAction.current = action;
  };
  return (
    <>
      <button
        aria-label="Open command palette"
        className={`${WINDOW_COMMAND_BUTTON_CLASS}${
          compactCommand ? ` ${WINDOW_COMMAND_BUTTON_COMPACT_CLASS}` : ""
        } max-[761px]:hidden`}
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
        aria-label={`${utilityOpen ? "Close" : "Open"} Activity`}
        aria-expanded={utilityOpen}
        className={`${WINDOW_UTILITY_BUTTON_CLASS} max-[761px]:hidden`}
        onClick={onToggleUtilities}
        title={`${utilityOpen ? "Close" : "Open"} Activity`}
        type="button"
      >
        <UiIcon icon={Activity} size="sm" />
        <span>Activity</span>
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
        className={`${WINDOW_RUNTIME_STATUS_CLASS} ${WINDOW_RUNTIME_STATUS_TONE[backend.phase]} max-[761px]:sr-only`}
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
        className={`${ICON_BUTTON_CLASS} max-[761px]:hidden`}
        onClick={onRefresh}
        title="Refresh runtime"
        type="button"
      >
        <UiIcon icon={RefreshCw} size="sm" />
      </button>
      <button
        aria-label="Open settings"
        className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[761px]:hidden"
        onClick={onOpenSettings}
        title="Settings"
        type="button"
      >
        <UiIcon icon={Settings} size="sm" />
      </button>
      <div className="min-[761px]:hidden">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Window actions"
              className={ICON_BUTTON_CLASS}
              title="Window actions"
              type="button"
              ref={menuTrigger}
            >
              <UiIcon icon={MoreHorizontal} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            aria-label="Window actions"
            className="dl-action-menu window-actions-menu"
            collisionPadding={8}
            onCloseAutoFocus={(event) => {
              const action = pendingMenuAction.current;
              if (!action) return;
              pendingMenuAction.current = null;
              event.preventDefault();
              // Close the menu before handing focus to a dialog or drawer.
              // App can then capture the persistent trigger as its return target.
              menuTrigger.current?.focus();
              void action();
            }}
          >
            <DropdownMenuLabel title={backend.message}>
              {backend.phase === "ready"
                ? "Local runtime ready"
                : backend.phase === "booting"
                  ? "Runtime starting"
                  : "Runtime offline"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runMenuAction(onOpenPalette)}>
              <UiIcon icon={Search} size="sm" />
              Open command palette
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runMenuAction(onToggleUtilities)}>
              <UiIcon icon={Activity} size="sm" />
              {utilityOpen ? "Close Activity" : "Open Activity"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runMenuAction(onRefresh)}>
              <UiIcon icon={RefreshCw} size="sm" />
              Refresh runtime data
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runMenuAction(onOpenSettings)}>
              <UiIcon icon={Settings} size="sm" />
              Open settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
