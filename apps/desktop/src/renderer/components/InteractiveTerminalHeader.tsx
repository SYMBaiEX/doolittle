import {
  CircleStop,
  Eraser,
  MessageSquarePlus,
  MoreHorizontal,
  PanelBottomClose,
  Pencil,
  Play,
  Plus,
  Square,
  Terminal,
  X,
} from "lucide-react";
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
  onClearOutput: () => void;
  onSendOutputToChat: () => void;
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
  outputAvailable: boolean;
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
  onClearOutput,
  onSendOutputToChat,
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
  outputAvailable,
  starting,
  tabRefs,
  tabs,
  maxTabs,
}: InteractiveTerminalHeaderProps) {
  const startActionLabel = starting
    ? "Opening shell"
    : hasPriorOutput
      ? "Restart shell"
      : "Open shell";
  const hideLabel = `Hide terminal${dismissShortcut ? ` (${dismissShortcut})` : ""}`;

  return (
    <header
      className={`${INTERACTIVE_TERMINAL_CHROME_CLASS} grid min-h-7.5 min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-1 gap-y-0.75 border-b px-1 py-0.75 shadow-[inset_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)] max-[1180px]:grid-cols-[minmax(0,1fr)_auto] max-[1180px]:grid-rows-[auto_auto]`}
    >
      <div className="flex min-w-0 items-center gap-1 px-0.5 max-[1180px]:col-span-full">
        <UiIcon
          className="shrink-0 text-[var(--accent)]"
          icon={Terminal}
          size="xs"
        />
        <i
          className={`size-1.5 shrink-0 rounded-full ${
            running
              ? "bg-[var(--accent)] shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_55%,transparent)]"
              : "bg-[color-mix(in_srgb,var(--muted)_65%,transparent)]"
          }`}
        />
        <span className="shrink-0 text-[length:var(--text-meta)] text-[var(--accent)] uppercase font-extrabold tracking-[0.08em]">
          {activeShell}
        </span>
        <strong
          className="min-w-0 truncate text-[10px] text-[var(--text)] tracking-[0.025em] max-[1180px]:hidden"
          title={activeCwdTitle}
        >
          {activeCwdLabel}
        </strong>
      </div>

      <div
        aria-label="Interactive terminal tabs"
        className="flex min-w-24 flex-1 flex-nowrap items-center gap-0.75 overflow-x-auto overscroll-x-contain [scrollbar-color:var(--accent-border)_transparent] [scrollbar-width:thin] max-[1180px]:col-span-full max-[1180px]:row-start-2"
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isRenaming = renamingTabId === tab.id;
          const tabLabelId = terminalTabLabelId(tab.id);
          return (
            <div
              className="group relative inline-flex shrink-0 items-center"
              key={tab.id}
            >
              <span className="sr-only" id={tabLabelId}>
                {tab.name} terminal tab
              </span>
              <button
                aria-controls={`interactive-terminal-${tab.id}-panel`}
                aria-labelledby={tabLabelId}
                aria-selected={isActive}
                className={`inline-flex h-5.5 min-w-18 max-w-30 items-center gap-1 rounded-[var(--radius-xs)] border py-0.5 pl-1.5 text-[var(--text-soft)] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] ${
                  isActive
                    ? "border-[color-mix(in_srgb,var(--accent)_48%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-raised))] pr-10 text-[var(--text)] shadow-[inset_0_-1px_var(--accent)]"
                    : "border-[color-mix(in_srgb,var(--border)_60%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_72%,transparent)] pr-1.5"
                } ${isRenaming ? "pointer-events-none opacity-0" : ""}`}
                id={`interactive-terminal-${tab.id}-tab`}
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => onBeginRename(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                role="tab"
                tabIndex={isActive && !isRenaming ? 0 : -1}
                title={`${tab.name} (${tab.state})`}
                type="button"
              >
                <i
                  className={`size-1.5 shrink-0 rounded-full ${
                    tab.state === "running"
                      ? "bg-[var(--accent)]"
                      : "bg-[color-mix(in_srgb,var(--muted)_45%,transparent)]"
                  }`}
                />
                <span className="truncate tracking-[0.01em]">{tab.name}</span>
              </button>
              {isRenaming ? (
                <input
                  aria-label={`Rename terminal ${tab.name}`}
                  className="absolute inset-0 z-3 h-5.5 min-w-18 max-w-30 rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--surface-soft)] px-1.5 text-[var(--text)]"
                  onBlur={onSaveRename}
                  onChange={(event) => onRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSaveRename();
                      requestAnimationFrame(() =>
                        tabRefs.current[tab.id]?.focus(),
                      );
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      onCancelRename();
                      requestAnimationFrame(() =>
                        tabRefs.current[tab.id]?.focus(),
                      );
                    }
                  }}
                  ref={renameInputRef}
                  type="text"
                  value={renamingValue}
                />
              ) : null}
              {isActive && !isRenaming ? (
                <>
                  <button
                    aria-label={`Rename terminal ${tab.name}`}
                    className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} absolute top-0 right-5.25 z-2 size-5 min-h-5 min-w-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                    onClick={() => onBeginRename(tab.id)}
                    type="button"
                  >
                    <UiIcon icon={Pencil} size="xs" />
                  </button>
                  <button
                    aria-label={`Close terminal ${tab.name}`}
                    className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} absolute top-0 right-0 z-2 size-5 min-h-5 min-w-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                    disabled={isClosingTab[tab.id]}
                    onClick={() => void onCloseTab(tab.id)}
                    type="button"
                  >
                    <UiIcon icon={X} size="xs" />
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-0.75 max-[1180px]:col-start-2 max-[1180px]:row-start-2">
        <button
          aria-label="Create terminal tab"
          className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
          disabled={tabs.length >= maxTabs}
          onClick={onCreateTab}
          type="button"
        >
          <UiIcon icon={Plus} size="sm" />
        </button>
        <span
          className={`hidden items-center rounded-[var(--radius-xs)] border px-1 py-0.5 text-[length:var(--text-meta)] font-bold tracking-[0.08em] min-[1280px]:inline-flex min-[1280px]:max-[1439px]:hidden ${
            running
              ? "border-[color-mix(in_srgb,var(--accent)_34%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--accent)]"
              : "border-[color-mix(in_srgb,var(--border)_60%,transparent)] text-[var(--faint)]"
          }`}
        >
          {running ? "LIVE" : "IDLE"}
        </span>
        <span className="interactive-terminal-mode hidden whitespace-nowrap text-[length:var(--text-meta)] text-[var(--faint)] tracking-[0.05em] min-[1440px]:inline">
          {currentStatus}
        </span>
        {running ? (
          <>
            <button
              aria-label="Interrupt foreground process"
              className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} inline-flex items-center gap-1.25`}
              onClick={onInterrupt}
              title="Interrupt foreground process"
              type="button"
            >
              <UiIcon icon={CircleStop} size="xs" />
              <span className="hidden min-[1280px]:inline">Ctrl+C</span>
            </button>
            <button
              aria-label="Stop terminal session"
              className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} inline-flex items-center gap-1.25`}
              onClick={onCloseActiveSession}
              title="Stop terminal session"
              type="button"
            >
              <UiIcon icon={Square} size="xs" />
              <span className="hidden min-[1280px]:inline">Stop</span>
            </button>
          </>
        ) : (
          <button
            aria-label={startActionLabel}
            className={`${INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS} inline-flex items-center gap-1.25`}
            disabled={!active || starting}
            onClick={onStart}
            title={startActionLabel}
            type="button"
          >
            <UiIcon icon={Play} size="xs" />
            <span className="hidden min-[1280px]:inline">
              {starting ? "Opening…" : startActionLabel}
            </span>
          </button>
        )}
        <button
          aria-label="Clear terminal view"
          className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} hidden min-[1280px]:inline-flex`}
          disabled={!outputAvailable}
          onClick={onClearOutput}
          title="Clear terminal view"
          type="button"
        >
          <UiIcon icon={Eraser} size="xs" />
        </button>
        <button
          aria-label="Add terminal output to chat"
          className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} hidden min-[1280px]:inline-flex`}
          disabled={!outputAvailable}
          onClick={onSendOutputToChat}
          title="Add terminal output to chat"
          type="button"
        >
          <UiIcon icon={MessageSquarePlus} size="xs" />
        </button>
        {onDismiss ? (
          <button
            aria-label={hideLabel}
            className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} hidden min-[1280px]:inline-flex min-[1280px]:items-center min-[1280px]:gap-1.25`}
            onClick={onDismiss}
            title={hideLabel}
            type="button"
          >
            <UiIcon icon={PanelBottomClose} size="xs" />
            <span className="hidden min-[1440px]:inline">Hide</span>
            {dismissShortcut ? (
              <kbd className="hidden font-inherit text-[var(--faint)] tracking-normal min-[1440px]:inline">
                {dismissShortcut}
              </kbd>
            ) : null}
          </button>
        ) : null}
        <details className="relative min-[1280px]:hidden">
          <summary
            aria-label="More terminal actions"
            className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} flex cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden`}
          >
            <UiIcon icon={MoreHorizontal} size="xs" />
          </summary>
          <div className="absolute top-[calc(100%+6px)] right-0 z-10 grid min-w-42 gap-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--border)_84%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_97%,var(--canvas-bg))] p-1 shadow-[0_16px_40px_color-mix(in_srgb,var(--shadow)_32%,transparent)]">
            <span className="px-1.5 pt-0.75 pb-0.25 font-mono text-[length:var(--text-meta)] tracking-[0.05em] text-[var(--faint)]">
              {running ? "LIVE" : "IDLE"} · {currentStatus}
            </span>
            <button
              aria-label="Clear terminal view"
              className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} inline-flex items-center justify-start gap-1.25`}
              disabled={!outputAvailable}
              onClick={onClearOutput}
              title="Clear terminal view"
              type="button"
            >
              <UiIcon icon={Eraser} size="xs" />
              <span>Clear view</span>
            </button>
            <button
              aria-label="Add terminal output to chat"
              className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} inline-flex items-center justify-start gap-1.25`}
              disabled={!outputAvailable}
              onClick={onSendOutputToChat}
              title="Add terminal output to chat"
              type="button"
            >
              <UiIcon icon={MessageSquarePlus} size="xs" />
              <span>Add to chat</span>
            </button>
            {onDismiss ? (
              <button
                aria-label={hideLabel}
                className={`${INTERACTIVE_TERMINAL_BUTTON_CLASS} inline-flex items-center justify-start gap-1.25`}
                onClick={onDismiss}
                title={hideLabel}
                type="button"
              >
                <UiIcon icon={PanelBottomClose} size="xs" />
                <span>{hideLabel}</span>
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  );
}
