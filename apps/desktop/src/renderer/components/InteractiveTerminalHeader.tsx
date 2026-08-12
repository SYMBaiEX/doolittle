import type { KeyboardEvent, RefObject } from "react";
import { terminalTabLabelId } from "./interactive-terminal-state";
import type { InteractiveTerminalTabState } from "./interactive-terminal-store";

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
    <header className="interactive-terminal-header">
      <div className="interactive-terminal-session-bar">
        <div className="interactive-terminal-identity">
          <i className={running ? "running" : ""} />
          <span>{activeShell}</span>
          <strong title={activeCwdTitle}>{activeCwdLabel}</strong>
        </div>
        <div className="interactive-terminal-controls">
          <span className="interactive-terminal-mode">{currentStatus}</span>
          {running ? (
            <>
              <button onClick={onInterrupt} type="button">
                Ctrl+C
              </button>
              <button onClick={onCloseActiveSession} type="button">
                Close
              </button>
            </>
          ) : (
            <button
              className="interactive-terminal-open"
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
              className="interactive-terminal-dismiss"
              onClick={onDismiss}
              type="button"
            >
              Hide{dismissShortcut ? <kbd>{dismissShortcut}</kbd> : null}
            </button>
          ) : null}
        </div>
      </div>
      <div className="interactive-terminal-tab-row">
        <div
          aria-label="Interactive terminal tabs"
          className="interactive-terminal-tabs"
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const tabLabelId = terminalTabLabelId(tab.id);
            return (
              <div className="interactive-terminal-tab-cell" key={tab.id}>
                <span className="sr-only" id={tabLabelId}>
                  {tab.name} terminal tab
                </span>
                {renamingTabId === tab.id ? (
                  <input
                    aria-label={`Rename terminal ${tab.name}`}
                    className="interactive-terminal-tab-name-input"
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
                    className={`interactive-terminal-tab ${isActive ? "interactive-terminal-tab-active" : ""}`}
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
                    <span className="interactive-terminal-tab-label">
                      {tab.name}
                    </span>
                    <small
                      className={`interactive-terminal-tab-state-${tab.state}`}
                    >
                      {tab.state}
                    </small>
                  </button>
                )}
                <button
                  aria-label={`Rename terminal ${tab.name}`}
                  className="interactive-terminal-tab-rename"
                  onClick={() => onBeginRename(tab.id)}
                  type="button"
                >
                  ✎
                </button>
                <button
                  aria-label={`Close terminal ${tab.name}`}
                  className="interactive-terminal-tab-close"
                  disabled={isClosingTab[tab.id]}
                  onClick={() => void onCloseTab(tab.id)}
                  type="button"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          aria-label="Create terminal tab"
          className="interactive-terminal-tab-add"
          disabled={tabs.length >= maxTabs}
          onClick={onCreateTab}
          type="button"
        >
          +
        </button>
      </div>
    </header>
  );
}
