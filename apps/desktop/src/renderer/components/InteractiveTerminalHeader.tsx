import { ContextActionMenu } from "@doolittle/ui";
import {
  CircleStop,
  FolderClosed,
  MoreHorizontal,
  PanelBottomClose,
  Play,
  Plus,
  Terminal,
  X,
} from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import { INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS } from "./interactive-terminal-layout";
import type { InteractiveTerminalTabState } from "./interactive-terminal-store";
import { UiIcon } from "./UiIcon";

type TerminalTab = InteractiveTerminalTabState;

function tabStatus(tab: TerminalTab): string {
  if (tab.pendingStart) return "Awaiting confirmation";
  if (tab.stale) return "Unavailable";
  switch (tab.state) {
    case "running":
      return "Running";
    case "exited":
      return tab.exitCode === null ? "Exited" : `Exited ${tab.exitCode}`;
    default:
      return tab.startedAt ? "Closed" : "Ready to open";
  }
}

export interface InteractiveTerminalHeaderProps {
  active: boolean;
  activeTabId: string;
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
  pendingStart?: boolean;
  panelId: string;
  tabRefs: RefObject<Record<string, HTMLButtonElement | null>>;
  tabs: readonly TerminalTab[];
  maxTabs: number;
  visible?: boolean;
}

export function InteractiveTerminalHeader({
  active,
  activeTabId,
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
  pendingStart = false,
  panelId,
  tabRefs,
  tabs,
  maxTabs,
  visible = true,
}: InteractiveTerminalHeaderProps) {
  const activeTab = tabs.find(({ id }) => id === activeTabId);
  const startActionLabel = starting
    ? "Opening shell"
    : pendingStart
      ? "Retry shell request"
      : hasPriorOutput
        ? "Restart shell"
        : "Open shell";
  const hideLabel = `Hide terminal${dismissShortcut ? ` (${dismissShortcut})` : ""}`;

  return (
    <header className="interactive-terminal-header">
      <span className="interactive-terminal-heading">
        <UiIcon icon={Terminal} />
        <span>Terminal</span>
      </span>
      <div
        aria-label="Interactive terminal tabs"
        className="interactive-terminal-tabs"
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTabId;
          const renaming = renamingTabId === tab.id;
          const status = tabStatus(tab);
          return (
            <ContextActionMenu
              key={tab.id}
              label={`Terminal tab: ${tab.name}`}
              scopeKey={tab.id}
              disabled={!visible}
              className="interactive-terminal-tab"
              items={[
                {
                  id: "focus-terminal",
                  label: "Select terminal tab",
                  onSelect: () => onSelectTab(tab.id),
                },
                {
                  id: "rename-terminal",
                  label: "Rename terminal…",
                  shortcut: "F2",
                  disabled: !!isClosingTab[tab.id] || renaming,
                  onSelect: () => onBeginRename(tab.id),
                },
                {
                  id: "close-terminal",
                  label:
                    tab.state === "running"
                      ? "Close terminal and shell"
                      : "Close terminal tab",
                  destructive: true,
                  disabled: !!isClosingTab[tab.id] || renaming,
                  onSelect: () => onCloseTab(tab.id),
                },
              ]}
            >
              <button
                aria-controls={selected ? panelId : undefined}
                aria-description={status}
                aria-label={`${tab.name} terminal tab`}
                aria-selected={selected}
                className="interactive-terminal-tab-select"
                data-renaming={renaming || undefined}
                data-pty-state={tab.state}
                data-awaiting={Boolean(tab.pendingStart) || undefined}
                id={`${panelId}-${tab.id}-tab`}
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => onBeginRename(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === "F2" && !isClosingTab[tab.id]) {
                    event.preventDefault();
                    onBeginRename(tab.id);
                    return;
                  }
                  onTabKeyDown(event, index);
                }}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                role="tab"
                tabIndex={selected && !renaming ? 0 : -1}
                title={`${tab.name} · ${status}`}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="interactive-terminal-tab-marker"
                />
                <span className="interactive-terminal-name">{tab.name}</span>
              </button>
              {renaming ? (
                <input
                  aria-label={`Rename terminal ${tab.name}`}
                  className="interactive-terminal-rename"
                  maxLength={48}
                  onBlur={onSaveRename}
                  onChange={(event) => onRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (!["Enter", "Escape"].includes(event.key)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === "Enter") onSaveRename();
                    else onCancelRename();
                    requestAnimationFrame(() =>
                      tabRefs.current[tab.id]?.focus(),
                    );
                  }}
                  ref={renameInputRef}
                  type="text"
                  value={renamingValue}
                />
              ) : null}
              {selected && !renaming ? (
                <button
                  aria-label={`Close terminal ${tab.name}`}
                  className={`${INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS} interactive-terminal-tab-close`}
                  disabled={isClosingTab[tab.id]}
                  onClick={() => onCloseTab(tab.id)}
                  title={`Close ${tab.name}`}
                  type="button"
                >
                  <UiIcon icon={X} size="xs" />
                </button>
              ) : null}
            </ContextActionMenu>
          );
        })}
      </div>
      <div className="interactive-terminal-actions">
        <button
          aria-label="Create terminal tab"
          className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
          disabled={tabs.length >= maxTabs}
          onClick={onCreateTab}
          title="New terminal tab"
          type="button"
        >
          <UiIcon icon={Plus} />
        </button>
        {running ? (
          <button
            aria-label="Interrupt foreground process"
            className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
            disabled={!active}
            onClick={onInterrupt}
            title="Interrupt foreground process (Ctrl+C)"
            type="button"
          >
            <UiIcon icon={CircleStop} />
          </button>
        ) : hasPriorOutput ? (
          <button
            aria-label={startActionLabel}
            className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
            disabled={!active || starting}
            onClick={onStart}
            title={startActionLabel}
            type="button"
          >
            <UiIcon icon={Play} size="xs" />
          </button>
        ) : null}
        <ContextActionMenu
          label="Terminal actions"
          scopeKey={activeTabId}
          disabled={!visible}
          items={[
            {
              id: "rename-terminal",
              label: "Rename active tab…",
              disabled: !activeTab || !!isClosingTab[activeTabId],
              onSelect: () => onBeginRename(activeTabId),
            },
            {
              id: "stop-terminal",
              label: "Stop terminal session",
              destructive: true,
              disabled: !active || !running,
              onSelect: onCloseActiveSession,
            },
            {
              id: "clear-output",
              label: "Clear terminal view",
              disabled: !outputAvailable,
              onSelect: onClearOutput,
            },
            {
              id: "send-output",
              label: "Add terminal output to chat",
              disabled: !outputAvailable,
              onSelect: onSendOutputToChat,
            },
          ]}
          trigger={
            <button
              aria-label="Terminal actions"
              className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
              title="Terminal actions"
              type="button"
            >
              <UiIcon icon={MoreHorizontal} />
            </button>
          }
        >
          {null}
        </ContextActionMenu>
        {onDismiss ? (
          <button
            aria-label={hideLabel}
            className={INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS}
            onClick={onDismiss}
            title={hideLabel}
            type="button"
          >
            <UiIcon icon={PanelBottomClose} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function InteractiveTerminalStatus({
  activeTab,
  cwdLabel,
  dimensions,
  starting,
}: {
  activeTab?: TerminalTab;
  cwdLabel: string;
  dimensions: string;
  starting: boolean;
}) {
  const status = starting
    ? "Opening shell"
    : activeTab
      ? tabStatus(activeTab)
      : "No shell";
  const shell = activeTab?.shell.split(/[\\/]/u).at(-1);
  return (
    <footer className="interactive-terminal-status">
      <span className="interactive-terminal-cwd" title={activeTab?.cwd}>
        <UiIcon icon={FolderClosed} size="xs" />
        <span>{cwdLabel}</span>
      </span>
      <span className="interactive-terminal-state">{status}</span>
      {activeTab?.startedAt ? (
        <span className="interactive-terminal-mode">
          {activeTab.pty ? "PTY" : "Pipe"}
          {shell ? (
            <span className="interactive-terminal-shell-name"> · {shell}</span>
          ) : null}
          {` · ${dimensions}`}
        </span>
      ) : null}
    </footer>
  );
}
