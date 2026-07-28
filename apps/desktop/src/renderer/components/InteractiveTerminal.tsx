import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
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
  resolveInteractiveTerminalWorkspaceState,
  saveInteractiveTerminalState,
} from "./interactive-terminal-store";
import "./interactive-terminal.css";

function compactPath(value: string): string {
  const parts = value.split(/[\\/]/u).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : value;
}

function boundedOutput(output: string): string {
  return output.slice(-MAX_RENDERED_TERMINAL_OUTPUT);
}

export function appendTerminalBytes(
  output: string,
  chunks: string,
  truncatedBeforeCursor = false,
): string {
  const marker = truncatedBeforeCursor
    ? "\n[Doolittle retained the newest terminal output.]"
    : "";
  return boundedOutput(`${output}${marker}${chunks}`);
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
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const xtermTabIdRef = useRef<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const pollingRef = useRef(false);
  const inputSequenceRef = useRef(Promise.resolve());
  const syncSessionRef = useRef<
    (tabId: string, snapshot: InteractiveTerminalSession) => void
  >(() => {});
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

  useEffect(() => {
    const viewport = viewportRef.current;
    const tab = tabs.find((candidate) => candidate.id === activeTabId);
    if (!viewport || !tab) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: false,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 5_000,
      theme: {
        background: "#0d0b0a",
        cursor: "#f5a623",
        foreground: "#e7dfd8",
        selectionBackground: "#6c4c2a",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(viewport);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    xtermTabIdRef.current = tab.id;
    terminal.write(tab.output);
    requestAnimationFrame(() => {
      fitAddon.fit();
      terminal.focus();
    });

    const disposable = terminal.onData((data) => {
      const activeTab = tabsRef.current.find(
        (candidate) => candidate.id === activeTabIdRef.current,
      );
      if (!activeTab?.sessionId || activeTab.state !== "running") return;
      inputSequenceRef.current = inputSequenceRef.current
        .then(() =>
          window.doolittle.writeInteractiveTerminal({
            sessionId: activeTab.sessionId as string,
            data,
          }),
        )
        .then((session) => syncSessionRef.current(activeTab.id, session))
        .catch((error) => setNotice(errorMessage(error)));
    });

    return () => {
      disposable.dispose();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      xtermTabIdRef.current = null;
    };
  }, [activeTabId, workspacePath]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const running = activeTab?.state === "running";
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
      const chunks = snapshot.chunks.map((chunk) => chunk.data).join("");
      if (!chunks && !snapshot.truncatedBeforeCursor) return;
      if (xtermTabIdRef.current === tabId) {
        if (snapshot.truncatedBeforeCursor) {
          xtermRef.current?.write("\r\n[Doolittle retained the newest terminal output.]\r\n");
        }
        if (chunks) xtermRef.current?.write(chunks);
      }
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            state: snapshot.session.state,
            cursor: snapshot.nextCursor,
            sessionId: snapshot.session.id,
            output: appendTerminalBytes(
              tab.output,
              chunks,
              snapshot.truncatedBeforeCursor,
            ),
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

  useEffect(() => {
    syncSessionRef.current = syncSession;
  }, [syncSession]);

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
      xtermRef.current?.write(
        "\r\n[Doolittle started a new terminal session.]\r\n",
      );
      setNotice("");
      xtermRef.current?.focus();
      void pollOutput(activeTab.id, session.id, 0);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setStarting(false);
    }
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
    requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
  };

  const selectTab = (tabId: string) => {
    if (tabId === activeTabId) return;
    if (!tabs.some((tab) => tab.id === tabId)) return;
    setActiveTabId(tabId);
    setNotice("");
    requestAnimationFrame(() => tabRefs.current[tabId]?.focus());
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
      <div
        aria-label="Terminal output"
        aria-live="off"
        className="interactive-terminal-output"
        id={
          activeTab ? `interactive-terminal-${activeTab.id}-panel` : undefined
        }
        ref={viewportRef}
        role="tabpanel"
      />
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
