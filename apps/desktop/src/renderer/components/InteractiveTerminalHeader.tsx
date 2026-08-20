import { Pencil, Plus, X } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import {
  INTERACTIVE_TERMINAL_BUTTON_CLASS,
  INTERACTIVE_TERMINAL_CHROME_CLASS,
  INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS,
  INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS,
} from "./interactive-terminal-layout";
import { terminalTabLabelId } from "./interactive-terminal-state";
import type { InteractiveTerminalTabState } from "./interactive-terminal-store";
import { UiIcon } from "./UiIcon";

export interface InteractiveTerminalHeaderProps {
  active: boolean;
  activeTabId: string;
  activeCwdLabel: string;
  activeCwdTitle?: string;
  activeShell: string;
  currentStatus: string;
  dismissShortcut?: string;
  hasPriorOutput: boolean;
  isClosingTab: Record<string, boolean>;
  onDismiss?: () => void;
  onInterrupt: () => void;
  onCloseActiveSession: () => void;
  onStart: () => void;
  onTabKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => void;
  onSelectTab: (tabId: string) => void;
  onCreateTab: () => void;
  onCloseTab: (tabId: string) => void;
  onBeginRename: (tabId: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onRenameChange: (value: string) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renamingTabId: string | null;
  renamingValue: string;
  running: boolean;
  starting: boolean;
  tabRefs: RefObject<Record<string, HTMLButtonElement | null>>;
  tabs: readonly InteractiveTerminalTabState[];
  maxTabs: number;
}

export function InteractiveTerminalHeader({
  active,
  activeTabId,
  activeCwdLabel,
  activeCwdTitle,
  activeShell,
  currentStatus,
  dismissShortcut,
  hasPriorOutput,
  isClosingTab,
  onDismiss,
  onInterrupt,
  onCloseActiveSession,
  onStart,
  onTabKeyDown,
  onSelectTab,
  onCreateTab,
  onCloseTab,
  onBeginRename,
  onSaveRename,
  onCancelRename,
  onRenameChange,
  renameInputRef,
  renamingTabId,
  renamingValue,
  running,
  starting,
  tabRefs,
  tabs,
  maxTabs,
}: InteractiveTerminalHeaderProps) {
  return (
    <header
      className={`${INTERACTIVE_TERMINAL_CHROME_CLASS} flex flex-col border-b p-0 shadow-[inset_0_1px_color-mix(in_srgb,var(--accent)_16%,transparent)]`}
    >
      <div className="flex min-h-9.5 min-w-0 items-center justify-between gap-2 px-2 pt-1.5 pb-1.25 pl-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.75">
          <i
            className={`size-1.75 shrink-0 rounded-full ${
              running
                ? "bg-[var(--accent)] shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_55%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--muted)_65%,transparent)]"
            }`}
          />
          <span className="shrink-0 text-[length:var(--text-meta)] text-[var(--accent)] uppercase font-extrabold tracking-[0.09em]">
            {activeShell}
          </span>
          <strong
            className="min-w-0 truncate text-[10px] text-[var(--text)] tracking-[0.04em]"
            title={activeCwdTitle}
          >
            {activeCwdLabel}
          </strong>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.25">
          <span className="interactive-terminal-mode whitespace-nowrap text-[length:var(--text-meta)] text-[var(--faint)] tracking-[0.06em]">
            {currentStatus}
          </span>
          {running ? (
            <>
              <button
                className={INTERACTIVE_TERMINAL_BUTTON_CLASS}
                onClick={onInterrupt}
                type="button"
              >
                Ctrl+C
              </button>
              <button
                className={INTERACTIVE_TERMINAL_BUTTON_CLASS}
                onClick={onCloseActiveSession}
                type="button"
              >
                Close
              </button>
            </>
          ) : (
            <button
              className={INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS}
              disabled={!active || starting}
              onClick={onStart}
              type="button"
            >
              {starting
                ? "Opening…"
                : hasPriorOutput
                  ? "Restart shell"
                  : "Open shell"}
            </button>
          )}
          {onDismiss ? (
            <button
              aria-label={`Hide terminal${dismissShortcut ? ` (${dismissShortcut})` : ""}`}
              className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} inline-flex items-center gap-1.25`}
              onClick={onDismiss}
              type="button"
            >
              Hide
              {dismissShortcut ? (
                <kbd className="font-inherit text-[var(--faint)] tracking-normal">
                  {dismissShortcut}
                </kbd>
              ) : null}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-8.75 min-w-0 items-center gap-1 overflow-hidden border-[color-mix(in_srgb,var(--border)_70%,transparent)] border-t bg-[color-mix(in_srgb,var(--canvas-bg)_44%,transparent)] px-1.5 pt-1 pb-1.25">
        <div
          aria-label="Interactive terminal tabs"
          className="flex min-w-0 flex-1 flex-nowrap items-stretch gap-0.75 overflow-x-auto overscroll-x-contain [scrollbar-color:var(--accent-border)_transparent] [scrollbar-width:thin]"
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const tabLabelId = terminalTabLabelId(tab.id);
            return (
              <div
                className="group relative inline-flex shrink-0 items-stretch"
                key={tab.id}
              >
                <span className="sr-only" id={tabLabelId}>
                  {tab.name} terminal tab
                </span>
                {renamingTabId === tab.id ? (
                  <input
                    aria-label={`Rename terminal ${tab.name}`}
                    className="min-h-6.5 min-w-30 max-w-47.5 rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--surface-soft)] px-1.75 py-0.5 text-[var(--text)]"
                    onBlur={onSaveRename}
                    onChange={(event) => onRenameChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onSaveRename();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        onCancelRename();
                      }
                    }}
                    ref={renameInputRef}
                    type="text"
                    value={renamingValue}
                  />
                ) : (
                  <button
                    aria-controls={`interactive-terminal-${tab.id}-panel`}
                    aria-labelledby={tabLabelId}
                    aria-selected={isActive}
                    className={`inline-flex h-6.25 min-w-31.5 items-center gap-1.5 rounded-[var(--radius-xs)] border py-0.5 pr-11.25 pl-2 text-[var(--text-soft)] hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] ${
                      isActive
                        ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-raised))] text-[var(--text)] shadow-[inset_0_-2px_var(--accent)]"
                        : "border-[color-mix(in_srgb,var(--border)_60%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_72%,transparent)]"
                    }`}
                    id={`interactive-terminal-${tab.id}-tab`}
                    onClick={() => onSelectTab(tab.id)}
                    onDoubleClick={() => onBeginRename(tab.id)}
                    onKeyDown={(event) => onTabKeyDown(event, index)}
                    ref={(node) => {
                      tabRefs.current[tab.id] = node;
                    }}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    title={`${tab.name} (${tab.state})`}
                    type="button"
                  >
                    <span className="max-w-40 truncate tracking-[0.01em]">
                      {tab.name}
                    </span>
                    <small
                      className={`ml-auto inline-flex shrink-0 text-[length:var(--text-meta)] ${
                        tab.state === "running"
                          ? "text-[var(--accent)]"
                          : "text-[color-mix(in_srgb,var(--muted)_56%,transparent)]"
                      }`}
                    >
                      {tab.state}
                    </small>
                  </button>
                )}
                <button
                  aria-label={`Rename terminal ${tab.name}`}
                  className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} absolute top-0.5 right-5.75 z-2 size-5.25 min-h-5.25 min-w-5.25 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                  onClick={() => onBeginRename(tab.id)}
                  type="button"
                >
                  <UiIcon icon={Pencil} size="xs" />
                </button>
                <button
                  aria-label={`Close terminal ${tab.name}`}
                  className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} absolute top-0.5 right-0.5 z-2 size-5.25 min-h-5.25 min-w-5.25 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                  disabled={isClosingTab[tab.id]}
                  onClick={() => void onCloseTab(tab.id)}
                  type="button"
                >
                  <UiIcon icon={X} size="xs" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          aria-label="Create terminal tab"
          className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
          disabled={tabs.length >= maxTabs}
          onClick={onCreateTab}
          type="button"
        >
          <UiIcon icon={Plus} size="sm" />
        </button>
      </div>
    </header>
  );
}
