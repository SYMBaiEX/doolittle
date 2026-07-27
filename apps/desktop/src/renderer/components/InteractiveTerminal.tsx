import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  InteractiveTerminalOutput,
  InteractiveTerminalSession,
} from "../../shared/contracts";
import { errorMessage } from "../lib";
import {
  browserInteractiveTerminalStorage,
  createInteractiveTerminalTab,
  type InteractiveTerminalTabState,
  loadInteractiveTerminalState,
  MAX_INTERACTIVE_TERMINAL_TABS,
  MAX_RENDERED_TERMINAL_OUTPUT,
  MAX_TERMINAL_COMMAND_HISTORY,
  resolveInteractiveTerminalWorkspaceState,
  saveInteractiveTerminalState,
} from "./interactive-terminal-store";
import "./interactive-terminal.css";

const ANSI_PATTERN =
  // biome-ignore lint/complexity/useRegexLiterals: String-backed control escapes are safer to review.
  new RegExp(
    "\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\))",
    "gu",
  );
const CONTROL_PATTERN =
  // biome-ignore lint/complexity/useRegexLiterals: Avoid literal control characters in source.
  new RegExp("[\\u0000-\\u0008\\u000B-\\u001F\\u007F]", "gu");

function plainTerminalText(value: string): string {
  return value
    .replace(ANSI_PATTERN, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n")
    .replace(CONTROL_PATTERN, "");
}

function compactPath(value: string): string {
  const parts = value.split(/[\\/]/u).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : value;
}

function clampHistory(value: number): number {
  if (!Number.isFinite(value)) return -1;
  return Math.max(-1, Math.floor(value));
}

function boundedOutput(output: string): string {
  return output.slice(-MAX_RENDERED_TERMINAL_OUTPUT);
}

function preserveTabs(
  workspacePath: string,
  tabs: InteractiveTerminalTabState[],
): InteractiveTerminalTabState[] {
  const bounded = tabs.slice(0, MAX_INTERACTIVE_TERMINAL_TABS);
  if (bounded.length > 0) return bounded;
  const fallback = createInteractiveTerminalTab("Terminal 1");
  fallback.cwd = workspacePath || fallback.cwd;
  return [fallback];
}

function nextTabName(index: number): string {
  return `Terminal ${index + 1}`;
}

export function InteractiveTerminal({
  active,
  onSendToChat,
  workspacePath,
}: {
  active: boolean;
  onSendToChat: (text: string) => void;
  workspacePath: string;
}) {
  const storage = useMemo(() => browserInteractiveTerminalStorage(), []);
  const loaded = useMemo(
    () => loadInteractiveTerminalState(workspacePath, storage),
    [storage, workspacePath],
  );
  const [tabs, setTabs] = useState(() =>
    preserveTabs(workspacePath, loaded.tabs),
  );
  const tabsRef = useRef(tabs);
  const [activeTabId, setActiveTabId] = useState(loaded.activeTabId);
  const activeTabIdRef = useRef(loaded.activeTabId);
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyIndexes, setHistoryIndexes] = useState<Record<string, number>>(
    {},
  );
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const viewportRef = useRef<HTMLPreElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const pollingRef = useRef(false);
  const dimensionsRef = useRef({ cols: 100, rows: 30 });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isClosingTab, setIsClosingTab] = useState<Record<string, boolean>>({});
  const loadedWorkspaceRef = useRef(workspacePath);

  useEffect(() => {
    if (loadedWorkspaceRef.current === workspacePath) return;
    const previousWorkspacePath = loadedWorkspaceRef.current;
    loadedWorkspaceRef.current = workspacePath;
    const loadedState = resolveInteractiveTerminalWorkspaceState({
      previousWorkspacePath,
      nextWorkspacePath: workspacePath,
      currentState: {
        activeTabId: activeTabIdRef.current,
        tabs: tabsRef.current,
      },
      storage,
    });
    const normalized = preserveTabs(workspacePath, loadedState.tabs);
    const nextActiveTabId = normalized.some(
      (tab) => tab.id === loadedState.activeTabId,
    )
      ? loadedState.activeTabId
      : (normalized[0]?.id ?? loadedState.activeTabId);
    tabsRef.current = normalized;
    setTabs(normalized);
    activeTabIdRef.current = nextActiveTabId;
    setActiveTabId(nextActiveTabId);
    setDrafts((current) => {
      const next: Record<string, string> = {};
      for (const tab of normalized) next[tab.id] = current[tab.id] ?? "";
      return next;
    });
    setHistoryIndexes((current) => {
      const next: Record<string, number> = {};
      for (const tab of normalized)
        next[tab.id] = clampHistory(current[tab.id] ?? -1);
      return next;
    });
    setNotice("");
    setStarting(false);
    setRenamingTabId(null);
    setRenamingValue("");
  }, [workspacePath, storage]);

  useEffect(() => {
    const normalized = preserveTabs(workspacePath, tabs);
    const idsMatch =
      normalized.length === tabs.length &&
      normalized.every((tab, index) => tab.id === tabs[index]?.id);
    if (!idsMatch) setTabs(normalized);
    if (!normalized.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(normalized[0]?.id ?? activeTabId);
    }
  }, [tabs, activeTabId, workspacePath]);

  useEffect(() => {
    saveInteractiveTerminalState(workspacePath, { activeTabId, tabs }, storage);
  }, [activeTabId, storage, tabs, workspacePath]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const running = activeTab?.state === "running";
  const activeDraft = activeTab ? (drafts[activeTab.id] ?? "") : "";
  const activeHistoryIndex = activeTab
    ? clampHistory(historyIndexes[activeTab.id] ?? -1)
    : -1;

  const updateTab = useCallback(
    (
      tabId: string,
      updater: (
        tab: InteractiveTerminalTabState,
      ) => InteractiveTerminalTabState,
    ) => {
      setTabs((current) =>
        current.map((tab) => (tab.id === tabId ? updater(tab) : tab)),
      );
    },
    [],
  );

  const setTabToClosed = useCallback(
    (tabId: string, message = "Terminal session is no longer available.") => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                state: "closed",
                sessionId: null,
                stale: true,
                output: boundedOutput(`${tab.output}\n[${message}]\n`),
                outputBytes: 0,
              }
            : tab,
        ),
      );
      setNotice(message);
    },
    [],
  );

  const appendOutputToTab = useCallback(
    (tabId: string, snapshot: InteractiveTerminalOutput) => {
      const chunks = plainTerminalText(
        snapshot.chunks.map((chunk) => chunk.data).join(""),
      );
      if (!chunks && !snapshot.truncatedBeforeCursor) return;
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) return tab;
          const marker = snapshot.truncatedBeforeCursor
            ? "\n[Doolittle retained the newest terminal output.]"
            : "";
          return {
            ...tab,
            state: snapshot.session.state,
            cursor: snapshot.nextCursor,
            sessionId: snapshot.session.id,
            output: boundedOutput(`${tab.output}${marker}${chunks}`),
            shell: snapshot.session.shell,
            cwd: snapshot.session.cwd,
            cols: snapshot.session.cols,
            rows: snapshot.session.rows,
            startedAt: snapshot.session.startedAt,
            completedAt: snapshot.session.completedAt ?? null,
            exitCode: snapshot.session.exitCode ?? null,
            pty: snapshot.session.pty,
            supportsResize: snapshot.session.supportsResize,
            outputBytes: snapshot.session.outputBytes,
            stale: false,
          };
        }),
      );
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      });
      setNotice("");
    },
    [],
  );

  const pollOutput = useCallback(
    async (tabId: string, sessionId: string, cursor: number) => {
      if (!sessionId || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const snapshot = await window.doolittle.getInteractiveTerminalOutput(
          sessionId,
          cursor,
        );
        appendOutputToTab(tabId, snapshot);
      } catch (error) {
        setTabToClosed(
          tabId,
          `Terminal ${tabId.slice(0, 8)} cannot be polled after navigation.`,
        );
        setNotice(errorMessage(error));
      } finally {
        pollingRef.current = false;
      }
    },
    [appendOutputToTab, setTabToClosed],
  );

  const syncSession = useCallback(
    (tabId: string, snapshot: InteractiveTerminalSession) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        sessionId: snapshot.id,
        state: snapshot.state,
        shell: snapshot.shell,
        cwd: snapshot.cwd,
        cols: snapshot.cols,
        rows: snapshot.rows,
        startedAt: snapshot.startedAt,
        completedAt: snapshot.completedAt ?? null,
        exitCode: snapshot.exitCode ?? null,
        pty: snapshot.pty,
        supportsResize: snapshot.supportsResize,
        outputBytes: snapshot.outputBytes,
        stale: false,
      }));
    },
    [updateTab],
  );

  const onStart = async () => {
    if (!activeTab || starting || !active) return;
    setStarting(true);
    setNotice("Review the interactive shell in the native confirmation.");
    try {
      const result = await window.doolittle.startInteractiveTerminal(
        dimensionsRef.current,
      );
      if (result.status === "cancelled") {
        setNotice("Terminal start cancelled.");
        return;
      }

      const session = result.session;
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        output: boundedOutput(
          `${tab.output}[Doolittle started a new terminal session.]\n`,
        ),
        cursor: 0,
        sessionId: session.id,
        state: session.state,
        shell: session.shell,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        startedAt: session.startedAt,
        completedAt: session.completedAt ?? null,
        exitCode: session.exitCode ?? null,
        pty: session.pty,
        supportsResize: session.supportsResize,
        outputBytes: session.outputBytes,
        stale: false,
      }));
      setNotice("");
      requestAnimationFrame(() => inputRef.current?.focus());
      void pollOutput(activeTab.id, session.id, 0);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !activeTab ||
      !active ||
      activeTab.state !== "running" ||
      !activeTab.sessionId
    )
      return;
    const command = activeDraft.trim();
    if (!command) return;
    setDrafts((current) => ({ ...current, [activeTab.id]: "" }));
    setHistoryIndexes((current) => ({
      ...current,
      [activeTab.id]: -1,
    }));
    try {
      await window.doolittle.writeInteractiveTerminal({
        sessionId: activeTab.sessionId,
        data: `${command}\n`,
      });
      setTabs((current) =>
        current.map((tab) =>
          tab.id !== activeTab.id
            ? tab
            : {
                ...tab,
                commandHistory: [
                  command,
                  ...tab.commandHistory.filter((entry) => entry !== command),
                ].slice(0, MAX_TERMINAL_COMMAND_HISTORY),
              },
        ),
      );
      void pollOutput(activeTab.id, activeTab.sessionId, activeTab.cursor);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!activeTab || activeTab.state !== "running" || !activeTab.sessionId)
      return;
    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      setDrafts((current) => ({ ...current, [activeTab.id]: "" }));
      void window.doolittle
        .interruptInteractiveTerminal(activeTab.sessionId)
        .then((session) => {
          syncSession(activeTab.id, {
            id: session.id,
            state: session.state,
            cwd: session.cwd,
            shell: session.shell,
            cols: session.cols,
            rows: session.rows,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            exitCode: session.exitCode,
            pty: session.pty,
            supportsResize: session.supportsResize,
            outputBytes: session.outputBytes,
          });
        })
        .catch((error) => setNotice(errorMessage(error)));
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!activeTab.commandHistory.length) return;
    event.preventDefault();
    const nextIndex =
      event.key === "ArrowUp"
        ? Math.min(activeTab.commandHistory.length - 1, activeHistoryIndex + 1)
        : Math.max(-1, activeHistoryIndex - 1);
    setHistoryIndexes((current) => ({
      ...current,
      [activeTab.id]: nextIndex,
    }));
    setDrafts((current) => ({
      ...current,
      [activeTab.id]:
        nextIndex < 0 ? "" : (activeTab.commandHistory[nextIndex] ?? ""),
    }));
  };

  const onInterrupt = async () => {
    if (!activeTab?.sessionId) return;
    try {
      const session = await window.doolittle.interruptInteractiveTerminal(
        activeTab.sessionId,
      );
      syncSession(activeTab.id, {
        id: session.id,
        state: session.state,
        cwd: session.cwd,
        shell: session.shell,
        cols: session.cols,
        rows: session.rows,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        exitCode: session.exitCode,
        pty: session.pty,
        supportsResize: session.supportsResize,
        outputBytes: session.outputBytes,
      });
      setNotice("Sent Ctrl+C to the foreground process.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const onCloseActiveSession = async () => {
    if (!activeTab?.sessionId) return;
    try {
      const session = await window.doolittle.closeInteractiveTerminal(
        activeTab.sessionId,
      );
      syncSession(activeTab.id, {
        id: session.id,
        state: session.state,
        cwd: session.cwd,
        shell: session.shell,
        cols: session.cols,
        rows: session.rows,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        exitCode: session.exitCode,
        pty: session.pty,
        supportsResize: session.supportsResize,
        outputBytes: session.outputBytes,
      });
      setNotice("Terminal session closed.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const closeTab = async (tabId: string) => {
    const target = tabs.find((tab) => tab.id === tabId);
    if (!target) return;
    const hasClose = isClosingTab[target.id] ?? false;
    if (hasClose) return;

    if (target.sessionId && target.state === "running") {
      setIsClosingTab((current) => ({ ...current, [tabId]: true }));
      try {
        const session = await window.doolittle.closeInteractiveTerminal(
          target.sessionId,
        );
        syncSession(tabId, {
          id: session.id,
          state: session.state,
          cwd: session.cwd,
          shell: session.shell,
          cols: session.cols,
          rows: session.rows,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          exitCode: session.exitCode,
          pty: session.pty,
          supportsResize: session.supportsResize,
          outputBytes: session.outputBytes,
        });
      } catch (error) {
        setNotice(errorMessage(error));
        setIsClosingTab((current) => ({ ...current, [tabId]: false }));
        return;
      }
    }

    const targetIndex = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const fallback = preserveTabs(
      workspacePath,
      nextTabs.length
        ? nextTabs
        : [createInteractiveTerminalTab(nextTabName(0))],
    );
    setTabs(fallback);
    if (activeTabId === tabId) {
      const nextActive = fallback[targetIndex] ?? fallback.at(-1);
      if (nextActive) setActiveTabId(nextActive.id);
    }
    setIsClosingTab((current) => ({ ...current, [tabId]: false }));
    setNotice(`Closed terminal ${target.name}.`);
  };

  const createTab = () => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length >= MAX_INTERACTIVE_TERMINAL_TABS) {
      setNotice(`Maximum ${MAX_INTERACTIVE_TERMINAL_TABS} terminals allowed.`);
      return;
    }
    const next = createInteractiveTerminalTab(nextTabName(currentTabs.length));
    next.cwd = workspacePath || next.cwd;
    const nextTabs = [...currentTabs, next];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveTabId(next.id);
    setDrafts((current) => ({ ...current, [next.id]: "" }));
    setHistoryIndexes((current) => ({ ...current, [next.id]: -1 }));
    requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
  };

  const selectTab = (tabId: string) => {
    if (tabId === activeTabId) return;
    if (!tabs.some((tab) => tab.id === tabId)) return;
    setActiveTabId(tabId);
    setNotice("");
    requestAnimationFrame(() => tabRefs.current[tabId]?.focus());
    setHistoryIndexes((current) => ({
      ...current,
      [tabId]: current[tabId] ?? -1,
    }));
  };

  const beginRename = (tabId: string) => {
    const target = tabs.find((tab) => tab.id === tabId);
    if (!target) return;
    setRenamingTabId(tabId);
    setRenamingValue(target.name);
    requestAnimationFrame(() => renameInputRef.current?.focus());
  };

  const saveRename = () => {
    if (!renamingTabId) return;
    const targetName = renamingValue.trim() || nextTabName(tabs.length);
    updateTab(renamingTabId, (tab) => ({
      ...tab,
      name: targetName.slice(0, 48),
    }));
    setRenamingTabId(null);
    setRenamingValue("");
  };

  const cancelRename = () => {
    setRenamingTabId(null);
    setRenamingValue("");
  };

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (tabs.length < 2) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const count = tabs.length;
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : event.key === "Home"
            ? 0
            : count - 1;
    const next = tabs[nextIndex];
    if (!next) return;
    selectTab(next.id);
  };

  const activeSessionId = activeTab?.sessionId;

  useEffect(() => {
    if (!active || !running || !activeSessionId) return;
    const tabId = activeTab?.id;
    const sessionId = activeSessionId;
    const cursor = activeTab?.cursor ?? 0;
    const poll = () =>
      tabId ? void pollOutput(tabId, sessionId, cursor) : null;
    const interval = window.setInterval(poll, 160);
    poll();
    return () => window.clearInterval(interval);
  }, [
    active,
    running,
    activeTab?.id,
    activeSessionId,
    activeTab?.cursor,
    pollOutput,
  ]);

  const activeSessionSupportsResize = activeTab?.supportsResize;

  useEffect(() => {
    if (!viewportRef.current || !running || !activeSessionId) return;
    const viewport = viewportRef.current;
    const resizeSessionId = activeSessionId;
    const resizeTabId = activeTab?.id;
    const resizeSupports = activeSessionSupportsResize;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || !resizeSessionId || !resizeTabId) return;
      const cols = Math.max(
        20,
        Math.min(400, Math.floor(entry.contentRect.width / 7.2)),
      );
      const rows = Math.max(
        5,
        Math.min(200, Math.floor(entry.contentRect.height / 17)),
      );
      if (
        dimensionsRef.current.cols === cols &&
        dimensionsRef.current.rows === rows
      )
        return;

      dimensionsRef.current = { cols, rows };
      if (!resizeSessionId || !resizeSupports) return;
      void window.doolittle
        .resizeInteractiveTerminal({
          sessionId: resizeSessionId,
          cols,
          rows,
        })
        .then((session) =>
          syncSession(resizeTabId, {
            id: session.id,
            state: session.state,
            cwd: session.cwd,
            shell: session.shell,
            cols: session.cols,
            rows: session.rows,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            exitCode: session.exitCode,
            pty: session.pty,
            supportsResize: session.supportsResize,
            outputBytes: session.outputBytes,
          }),
        )
        .catch((error) => setNotice(errorMessage(error)));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [
    activeTab?.id,
    activeSessionId,
    activeSessionSupportsResize,
    running,
    syncSession,
  ]);

  const currentStatus = activeTab
    ? `${activeTab.pty ? "PTY" : "PIPE"} · ${activeTab.cols}×${activeTab.rows}`
    : "No terminal";

  return (
    <section className="interactive-terminal" aria-label="Interactive terminal">
      <header className="interactive-terminal-header">
        <div className="interactive-terminal-tab-row">
          <div
            aria-label="Interactive terminal tabs"
            className="interactive-terminal-tabs"
            role="tablist"
          >
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTabId;
              return (
                <div className="interactive-terminal-tab-cell" key={tab.id}>
                  {renamingTabId === tab.id ? (
                    <input
                      aria-label={`Rename terminal ${tab.name}`}
                      className="interactive-terminal-tab-name-input"
                      onBlur={saveRename}
                      onChange={(event) => setRenamingValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      ref={renameInputRef}
                      type="text"
                      value={renamingValue}
                    />
                  ) : (
                    <button
                      aria-controls={`interactive-terminal-${tab.id}-panel`}
                      aria-label={`${tab.name} terminal tab`}
                      aria-selected={isActive}
                      className={`interactive-terminal-tab ${
                        isActive ? "interactive-terminal-tab-active" : ""
                      }`}
                      id={`interactive-terminal-${tab.id}-tab`}
                      onClick={() => selectTab(tab.id)}
                      onDoubleClick={() => beginRename(tab.id)}
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
                    onClick={() => beginRename(tab.id)}
                    type="button"
                  >
                    ✎
                  </button>
                  <button
                    aria-label={`Close terminal ${tab.name}`}
                    className="interactive-terminal-tab-close"
                    disabled={isClosingTab[tab.id]}
                    onClick={() => void closeTab(tab.id)}
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
            disabled={tabs.length >= MAX_INTERACTIVE_TERMINAL_TABS}
            onClick={createTab}
            type="button"
          >
            +
          </button>
        </div>
        <div className="interactive-terminal-header-metrics">
          <strong>
            {activeTab
              ? `${activeTab.shell} · ${compactPath(activeTab.cwd)}`
              : ""}
          </strong>
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
              className="primary-button"
              disabled={!active || starting}
              onClick={onStart}
              type="button"
            >
              {starting ? "Opening…" : "Open terminal"}
            </button>
          )}
        </div>
      </header>
      <pre
        aria-label="Terminal output"
        aria-live="off"
        className="interactive-terminal-output"
        id={
          activeTab ? `interactive-terminal-${activeTab.id}-panel` : undefined
        }
        ref={viewportRef}
        role="tabpanel"
      >
        {activeTab?.output
          ? activeTab.output
          : active
            ? "Open a terminal to run interactive commands in this workspace."
            : "Open a terminal tab to begin."}
      </pre>
      {running && activeTab?.sessionId ? (
        <form className="interactive-terminal-composer" onSubmit={onSubmit}>
          <span aria-hidden="true">❯</span>
          <label>
            <span className="sr-only">Terminal command</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              onChange={(event) =>
                activeTab &&
                setDrafts((current) => ({
                  ...current,
                  [activeTab.id]: event.target.value,
                }))
              }
              onKeyDown={onInputKeyDown}
              placeholder="Type a command…"
              ref={inputRef}
              spellCheck={false}
              value={activeDraft}
            />
          </label>
          <button disabled={!activeDraft.trim()} type="submit">
            Run
          </button>
        </form>
      ) : null}
      <footer className="interactive-terminal-footer">
        <span>
          {notice ||
            "Active tab output is preserved across workspace navigation."}
          {activeTab?.stale ? " · stale session" : ""}
        </span>
        <div>
          <button
            disabled={!activeTab?.output}
            onClick={() =>
              activeTab
                ? setTabs((current) =>
                    current.map((tab) =>
                      tab.id === activeTab.id ? { ...tab, output: "" } : tab,
                    ),
                  )
                : undefined
            }
            type="button"
          >
            Clear view
          </button>
          <button
            disabled={!activeTab?.output}
            onClick={() =>
              activeTab
                ? onSendToChat(
                    [
                      "Use this interactive terminal output as context.",
                      "<terminal_context>",
                      activeTab.output.slice(-20_000),
                      "</terminal_context>",
                    ].join("\n"),
                  )
                : undefined
            }
            type="button"
          >
            Add to chat
          </button>
        </div>
      </footer>
    </section>
  );
}
