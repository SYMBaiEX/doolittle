import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@xterm/xterm/css/xterm.css";
import type {
  InteractiveTerminalOutput,
  InteractiveTerminalSession,
} from "../../shared/contracts";
import { APPEARANCE_CHANGE_EVENT, THEME_CHANGE_EVENT } from "../desktop-theme";
import { errorMessage } from "../lib";
import { compactWorkspacePath } from "../workspace-path";
import { InteractiveTerminalHeader } from "./InteractiveTerminalHeader";
import { InteractiveTerminalSurface } from "./InteractiveTerminalSurface";
import { INTERACTIVE_TERMINAL_ROOT_CLASS } from "./interactive-terminal-layout";
import {
  appendTerminalBytes as appendTerminalOutputBytes,
  closeTerminalTabState,
  isCurrentTerminalSession,
} from "./interactive-terminal-state";
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

export function appendTerminalBytes(
  output: string,
  chunks: string,
  truncatedBeforeCursor = false,
): string {
  return appendTerminalOutputBytes(
    output,
    chunks,
    MAX_RENDERED_TERMINAL_OUTPUT,
    truncatedBeforeCursor,
  );
}

function colorWithAlpha(
  color: string,
  alpha: string,
  fallback: string,
): string {
  const compact = color.match(/^#([\da-f])([\da-f])([\da-f])$/iu);
  if (compact) {
    return `#${compact[1]}${compact[1]}${compact[2]}${compact[2]}${compact[3]}${compact[3]}${alpha}`;
  }
  return /^#[\da-f]{6}$/iu.test(color) ? `${color}${alpha}` : fallback;
}

export function interactiveTerminalTheme(
  style: Pick<CSSStyleDeclaration, "getPropertyValue">,
): ITheme {
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  const background = token("--canvas-bg", "#080706");
  const foreground = token("--canvas-text", "#f4f1eb");
  const softText = token("--canvas-text-soft", "#c9c3b9");
  const accent = token("--accent", "#ff6b16");
  const good = token("--good", "#86b875");
  const warn = token("--warn", "#e7a84d");
  const bad = token("--bad", "#e47763");

  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: token("--accent-ink", "#1b0b02"),
    selectionBackground: colorWithAlpha(accent, "66", softText),
    selectionInactiveBackground: colorWithAlpha(accent, "33", background),
    black: background,
    brightBlack: token("--theme-muted", softText),
    red: bad,
    brightRed: bad,
    green: good,
    brightGreen: good,
    yellow: warn,
    brightYellow: warn,
    blue: token("--terminal-blue", accent),
    brightBlue: token("--terminal-bright-blue", accent),
    magenta: token("--terminal-magenta", accent),
    brightMagenta: token("--terminal-bright-magenta", accent),
    cyan: token("--terminal-cyan", accent),
    brightCyan: token("--terminal-bright-cyan", accent),
    white: foreground,
    brightWhite: foreground,
  };
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
  autoStart = false,
  dismissShortcut,
  onDismiss,
  onSendToChat,
  workspacePath,
}: {
  active: boolean;
  autoStart?: boolean;
  dismissShortcut?: string;
  onDismiss?: () => void;
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
  const dimensionsRef = useRef({ cols: 100, rows: 30 });
  const [terminalSize, setTerminalSize] = useState(dimensionsRef.current);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isClosingTab, setIsClosingTab] = useState<Record<string, boolean>>({});
  const loadedWorkspaceRef = useRef(workspacePath);
  const autoStartedTabRef = useRef<string | null>(null);

  const fitTerminalToViewport = useCallback(() => {
    const terminal = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return dimensionsRef.current;
    try {
      fitAddon.fit();
    } catch {
      return dimensionsRef.current;
    }
    const next = {
      cols: Math.max(20, Math.min(400, terminal.cols)),
      rows: Math.max(5, Math.min(200, terminal.rows)),
    };
    dimensionsRef.current = next;
    setTerminalSize((current) =>
      current.cols === next.cols && current.rows === next.rows ? current : next,
    );
    return next;
  }, []);

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
    const tab = tabsRef.current.find(
      (candidate) => candidate.id === activeTabId,
    );
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
      theme: interactiveTerminalTheme(
        getComputedStyle(document.documentElement),
      ),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(viewport);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    xtermTabIdRef.current = tab.id;
    terminal.write(tab.output);
    requestAnimationFrame(() => {
      fitTerminalToViewport();
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
        .then((session) => syncSession(activeTab.id, session))
        .catch((error) => setNotice(errorMessage(error)));
    });

    return () => {
      disposable.dispose();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      xtermTabIdRef.current = null;
    };
  }, [activeTabId, fitTerminalToViewport, syncSession]);

  useEffect(() => {
    const updateTheme = () => {
      const terminal = xtermRef.current;
      if (!terminal) return;
      terminal.options.theme = interactiveTerminalTheme(
        getComputedStyle(document.documentElement),
      );
    };
    window.addEventListener(THEME_CHANGE_EVENT, updateTheme);
    window.addEventListener(APPEARANCE_CHANGE_EVENT, updateTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, updateTheme);
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, updateTheme);
    };
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const running = activeTab?.state === "running";

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
          xtermRef.current?.write(
            "\r\n[Doolittle retained the newest terminal output.]\r\n",
          );
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
        if (!isCurrentTerminalSession(tabsRef.current, tabId, sessionId)) {
          return;
        }
        setTabToClosed(tabId);
        setNotice(errorMessage(error));
      } finally {
        pollingRef.current = false;
      }
    },
    [appendOutputToTab, setTabToClosed],
  );

  const onStart = useCallback(async () => {
    if (!activeTab || starting || !active) return;
    setStarting(true);
    setNotice("Opening workspace shell…");
    try {
      const dimensions = fitTerminalToViewport();
      const result =
        await window.doolittle.startInteractiveTerminal(dimensions);
      const session = result.session;
      updateTab(activeTab.id, (tab) => ({
        ...tab,
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
      xtermRef.current?.focus();
      void pollOutput(activeTab.id, session.id, 0);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }, [
    active,
    activeTab,
    fitTerminalToViewport,
    pollOutput,
    starting,
    updateTab,
  ]);

  useEffect(() => {
    if (!autoStart || !active || !activeTab || running || starting) return;
    if (autoStartedTabRef.current === activeTab.id) return;
    autoStartedTabRef.current = activeTab.id;
    void onStart();
  }, [active, activeTab, autoStart, onStart, running, starting]);

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
    const target = tabsRef.current.find((tab) => tab.id === tabId);
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

    const fallbackTab = createInteractiveTerminalTab(nextTabName(0));
    fallbackTab.cwd = workspacePath || fallbackTab.cwd;
    const reconciled = closeTerminalTabState({
      tabs: tabsRef.current,
      activeTabId: activeTabIdRef.current,
      tabId,
      fallbackTab,
    });
    const nextTabs = preserveTabs(workspacePath, reconciled.tabs);
    tabsRef.current = nextTabs;
    activeTabIdRef.current = reconciled.activeTabId;
    setTabs(nextTabs);
    setActiveTabId(reconciled.activeTabId);
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
    activeTabIdRef.current = next.id;
    setTabs(nextTabs);
    setActiveTabId(next.id);
    requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
  };

  const selectTab = (tabId: string) => {
    if (tabId === activeTabIdRef.current) return;
    if (!tabsRef.current.some((tab) => tab.id === tabId)) return;
    activeTabIdRef.current = tabId;
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

  useIntervalWhenDocumentVisible(
    () => {
      if (!activeSessionId) return;
      const tabId = activeTab?.id;
      if (tabId) {
        void pollOutput(tabId, activeSessionId, activeTab?.cursor ?? 0);
      }
    },
    160,
    active && running && Boolean(activeSessionId),
  );

  const activeSessionSupportsResize = activeTab?.supportsResize;

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      fitTerminalToViewport();
      xtermRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, fitTerminalToViewport]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current;
    const resizeSessionId = activeSessionId;
    const resizeTabId = activeTab?.id;
    const resizeSupports = activeSessionSupportsResize;
    let settledResizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      if (settledResizeTimer) clearTimeout(settledResizeTimer);
      settledResizeTimer = setTimeout(() => {
        const dimensions = fitTerminalToViewport();
        if (
          !running ||
          !resizeSessionId ||
          !resizeTabId ||
          !resizeSupports ||
          (activeTab?.cols === dimensions.cols &&
            activeTab?.rows === dimensions.rows)
        ) {
          return;
        }
        void window.doolittle
          .resizeInteractiveTerminal({
            sessionId: resizeSessionId,
            cols: dimensions.cols,
            rows: dimensions.rows,
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
      }, 56);
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (settledResizeTimer) clearTimeout(settledResizeTimer);
    };
  }, [
    activeTab?.id,
    activeTab?.cols,
    activeTab?.rows,
    activeSessionId,
    activeSessionSupportsResize,
    fitTerminalToViewport,
    running,
    syncSession,
  ]);

  const currentStatus = activeTab
    ? `${activeTab.pty ? "PTY" : "PIPE"} · ${terminalSize.cols}×${terminalSize.rows}`
    : "No terminal";

  return (
    <section
      aria-label="Interactive terminal"
      className={INTERACTIVE_TERMINAL_ROOT_CLASS}
      data-interactive-terminal=""
    >
      <InteractiveTerminalHeader
        active={active}
        activeCwdLabel={
          activeTab ? compactWorkspacePath(activeTab.cwd, 3) : "Local workspace"
        }
        activeCwdTitle={activeTab?.cwd}
        activeShell={activeTab?.shell || "shell"}
        activeTabId={activeTabId}
        currentStatus={currentStatus}
        dismissShortcut={dismissShortcut}
        hasPriorOutput={Boolean(activeTab?.output)}
        isClosingTab={isClosingTab}
        maxTabs={MAX_INTERACTIVE_TERMINAL_TABS}
        onBeginRename={beginRename}
        onCancelRename={cancelRename}
        onCloseActiveSession={onCloseActiveSession}
        onCloseTab={closeTab}
        onCreateTab={createTab}
        onDismiss={onDismiss}
        onInterrupt={onInterrupt}
        onRenameChange={setRenamingValue}
        onSaveRename={saveRename}
        onSelectTab={selectTab}
        onStart={onStart}
        onTabKeyDown={onTabKeyDown}
        renameInputRef={renameInputRef}
        renamingTabId={renamingTabId}
        renamingValue={renamingValue}
        running={running}
        starting={starting}
        tabRefs={tabRefs}
        tabs={tabs}
      />
      <InteractiveTerminalSurface
        active={active}
        activeTab={activeTab}
        notice={notice}
        onSendToChat={onSendToChat}
        onStart={onStart}
        running={running}
        setTabs={setTabs}
        starting={starting}
        viewportRef={viewportRef}
      />
    </section>
  );
}
