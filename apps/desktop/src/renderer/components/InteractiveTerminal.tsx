import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@xterm/xterm/css/xterm.css";
import type {
  InteractiveTerminalOutput,
  InteractiveTerminalSession,
} from "../../shared/contracts";
import { type ComputerOrigin, computerOriginKey } from "../computer-origin";
import { APPEARANCE_APPLIED_EVENT, THEME_CHANGE_EVENT } from "../desktop-theme";
import { desktopRequest, errorMessage } from "../lib";
import { compactWorkspacePath } from "../workspace-path";
import { InteractiveTerminalHeader } from "./InteractiveTerminalHeader";
import { InteractiveTerminalSurface } from "./InteractiveTerminalSurface";
import { INTERACTIVE_TERMINAL_ROOT_CLASS } from "./interactive-terminal-layout";
import {
  interactiveTerminalPollDelay,
  TERMINAL_PERSIST_DEBOUNCE_MS,
  terminalOutputRecoveryDelay,
} from "./interactive-terminal-performance";
import {
  appendTerminalBytes as appendTerminalOutputBytes,
  closeTerminalTabState,
  isCurrentTerminalSession,
  isPristineTerminalTab,
  type PendingTerminalDiscard,
  pendingTerminalDiscardTarget,
  terminalChatContext,
  terminalLifecycleChanged,
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
import { mergeManagedApplicationTabs } from "./managed-application-tabs";

type TerminalPollResult = { hadOutput: boolean; nextDelay: number | null };

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

export function attachTerminalAcceleration(
  terminal: Pick<Terminal, "loadAddon">,
): {
  ready: Promise<boolean>;
  dispose: () => void;
} {
  if (typeof window === "undefined") {
    return { ready: Promise.resolve(false), dispose: () => undefined };
  }
  const hasWebglSupport =
    typeof window.WebGL2RenderingContext === "function" ||
    typeof window.WebGLRenderingContext === "function";
  if (!hasWebglSupport) {
    return { ready: Promise.resolve(false), dispose: () => undefined };
  }
  let disposed = false;
  let teardown = () => undefined;
  const ready = import("@xterm/addon-webgl")
    .then(({ WebglAddon }) => {
      if (disposed) return false;
      try {
        const addon = new WebglAddon();
        terminal.loadAddon(addon);
        const contextLoss = addon.onContextLoss(() => {
          try {
            addon.dispose();
          } catch {
            // Ignore teardown failures; xterm falls back to its default renderer.
          }
        });
        teardown = () => {
          contextLoss.dispose();
          addon.dispose();
        };
        return true;
      } catch {
        return false;
      }
    })
    .catch(() => false);
  return {
    ready,
    dispose: () => {
      disposed = true;
      teardown();
    },
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

const PENDING_START_NOTICE =
  "Shell creation is unconfirmed. Retry shell request using the same request ID.";

export function InteractiveTerminal({
  active,
  autoStart = false,
  dismissShortcut,
  onDismiss,
  onSendToChat,
  workspacePath,
  origin,
  allowLegacy = false,
}: {
  active: boolean;
  autoStart?: boolean;
  dismissShortcut?: string;
  onDismiss?: () => void;
  onSendToChat: (text: string) => void;
  workspacePath: string;
  origin?: ComputerOrigin;
  allowLegacy?: boolean;
}) {
  const ownerKey = computerOriginKey(origin);
  const botId = origin?.botId;
  const storage = useMemo(() => browserInteractiveTerminalStorage(), []);
  const loaded = useMemo(
    () =>
      loadInteractiveTerminalState(
        workspacePath,
        storage,
        ownerKey,
        allowLegacy,
      ),
    [storage, workspacePath, ownerKey, allowLegacy],
  );
  const [tabs, setTabs] = useState(() =>
    preserveTabs(workspacePath, loaded.tabs),
  );
  const tabsRef = useRef(tabs);
  const [activeTabId, setActiveTabId] = useState(loaded.activeTabId);
  const activeTabIdRef = useRef(loaded.activeTabId);
  const [notice, setNotice] = useState(() =>
    loaded.tabs.find((tab) => tab.id === loaded.activeTabId)?.pendingStart
      ? PENDING_START_NOTICE
      : "",
  );
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const pollEpochRef = useRef(pollEpoch);
  pollEpochRef.current = pollEpoch;
  const [starting, setStarting] = useState(false);
  const [pendingDiscard, setPendingDiscard] =
    useState<PendingTerminalDiscard | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const xtermTabIdRef = useRef<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const pollInFlightRef = useRef<{
    generation: number;
    tabId: string;
    sessionId: string;
    promise: Promise<TerminalPollResult>;
  } | null>(null);
  const pollFailuresRef = useRef({ sessionId: "", count: 0 });
  const pollRecoveryRef = useRef({ sessionId: "", nextAt: 0, stopped: false });
  const exitedPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollOutputRef = useRef<
    | ((
        tabId: string,
        sessionId: string,
        cursor: number,
      ) => Promise<TerminalPollResult>)
    | null
  >(null);
  const inputSequenceRef = useRef(Promise.resolve());
  const pendingTerminalWriteRef = useRef("");
  const terminalWriteFrameRef = useRef<number | null>(null);
  const persistenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const dimensionsRef = useRef({ cols: 100, rows: 30 });
  const [terminalSize, setTerminalSize] = useState(dimensionsRef.current);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isClosingTab, setIsClosingTab] = useState<Record<string, boolean>>({});
  const loadedWorkspaceRef = useRef(workspacePath);
  const loadedOwnerKeyRef = useRef(ownerKey);
  const autoStartedTabRef = useRef<string | null>(null);
  const focusContextRef = useRef({ active, workspacePath });
  focusContextRef.current = { active, workspacePath };
  const startRequestRef = useRef(0);
  const inFlightStartRef = useRef<{
    sequence: number;
    tabId: string;
    requestId: string;
  } | null>(null);
  const workspaceGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const ownsSessionOperation = useCallback(
    (tabId: string, sessionId: string) => {
      const generation = workspaceGenerationRef.current;
      const capturedOwnerKey = loadedOwnerKeyRef.current;
      const capturedWorkspacePath = loadedWorkspaceRef.current;
      const ownsRecord = () =>
        mountedRef.current &&
        workspaceGenerationRef.current === generation &&
        loadedOwnerKeyRef.current === capturedOwnerKey &&
        loadedWorkspaceRef.current === capturedWorkspacePath &&
        isCurrentTerminalSession(tabsRef.current, tabId, sessionId);
      return {
        ownsRecord,
        ownsPresentation: () =>
          ownsRecord() && activeTabIdRef.current === tabId,
      };
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (exitedPollTimerRef.current) clearTimeout(exitedPollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const discover = async () => {
      try {
        const result = await desktopRequest<{
          sessions: InteractiveTerminalSession[];
        }>(
          "/terminal/sessions",
          "GET",
          undefined,
          controller.signal,
          undefined,
          botId,
        );
        if (controller.signal.aborted) return;
        setTabs((current) => {
          const next = mergeManagedApplicationTabs(
            current,
            result.sessions ?? [],
          );
          tabsRef.current = next;
          return next;
        });
      } catch {
        // Discovery is supplementary; ordinary terminal tabs stay usable offline.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(discover, 2_000);
      }
    };
    void discover();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [active, botId]);

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
      setTabs((current) => {
        const next = current.map((tab) =>
          tab.id === tabId ? updater(tab) : tab,
        );
        tabsRef.current = next;
        return next;
      });
    },
    [],
  );

  const syncSession = useCallback(
    (tabId: string, snapshot: InteractiveTerminalSession) => {
      updateTab(tabId, (tab) =>
        tab.sessionId !== snapshot.id ||
        (tab.state !== "running" && snapshot.state === "running")
          ? tab
          : {
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
            },
      );
    },
    [updateTab],
  );

  useLayoutEffect(() => {
    if (
      loadedWorkspaceRef.current === workspacePath &&
      loadedOwnerKeyRef.current === ownerKey
    )
      return;
    // Pending startup callbacks no longer own this workspace's presentation.
    startRequestRef.current++;
    inFlightStartRef.current = null;
    workspaceGenerationRef.current++;
    pollInFlightRef.current = null;
    if (exitedPollTimerRef.current) {
      clearTimeout(exitedPollTimerRef.current);
      exitedPollTimerRef.current = null;
    }
    pollRecoveryRef.current = { sessionId: "", nextAt: 0, stopped: false };
    const previousWorkspacePath = loadedWorkspaceRef.current;
    const previousOwnerKey = loadedOwnerKeyRef.current;
    const ownerChanged = previousOwnerKey !== ownerKey;
    saveInteractiveTerminalState(
      previousWorkspacePath,
      { activeTabId: activeTabIdRef.current, tabs: tabsRef.current },
      storage,
      previousOwnerKey,
    );
    loadedWorkspaceRef.current = workspacePath;
    loadedOwnerKeyRef.current = ownerKey;
    const loadedState = ownerChanged
      ? loadInteractiveTerminalState(workspacePath, storage, ownerKey, false)
      : resolveInteractiveTerminalWorkspaceState({
          previousWorkspacePath,
          nextWorkspacePath: workspacePath,
          currentState: {
            activeTabId: activeTabIdRef.current,
            tabs: tabsRef.current,
          },
          storage,
          ownerKey,
          allowLegacy,
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
    setNotice(
      normalized.find((tab) => tab.id === nextActiveTabId)?.pendingStart
        ? PENDING_START_NOTICE
        : "",
    );
    setRetryAvailable(false);
    setStarting(false);
    setIsClosingTab({});
    setPendingDiscard(null);
    setRenamingTabId(null);
    setRenamingValue("");
  }, [workspacePath, storage, ownerKey, allowLegacy]);

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
    if (persistenceTimerRef.current) {
      clearTimeout(persistenceTimerRef.current);
    }
    persistenceTimerRef.current = setTimeout(() => {
      saveInteractiveTerminalState(
        workspacePath,
        { activeTabId, tabs },
        storage,
        ownerKey,
      );
      persistenceTimerRef.current = null;
    }, TERMINAL_PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistenceTimerRef.current) {
        clearTimeout(persistenceTimerRef.current);
        persistenceTimerRef.current = null;
      }
    };
  }, [activeTabId, storage, tabs, workspacePath, ownerKey]);

  useEffect(
    () => () => {
      if (persistenceTimerRef.current) {
        clearTimeout(persistenceTimerRef.current);
        persistenceTimerRef.current = null;
      }
      if (
        loadedWorkspaceRef.current !== workspacePath ||
        loadedOwnerKeyRef.current !== ownerKey
      )
        return;
      saveInteractiveTerminalState(
        workspacePath,
        {
          activeTabId: activeTabIdRef.current,
          tabs: tabsRef.current,
        },
        storage,
        ownerKey,
      );
    },
    [storage, workspacePath, ownerKey],
  );

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
      customGlyphs: true,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      cursorStyle: "block",
      convertEol: false,
      fastScrollSensitivity: 5,
      // Canvas font setters reject unresolved CSS variables; use the browser's
      // resolved mono stack so glyph atlases do not fall back to 10px sans-serif.
      fontFamily: getComputedStyle(viewport).fontFamily.trim() || "monospace",
      fontSize: 11.25,
      fontWeight: 500,
      letterSpacing: 0,
      lineHeight: 1.12,
      macOptionClickForcesSelection: true,
      minimumContrastRatio: 4.5,
      rightClickSelectsWord: true,
      scrollSensitivity: 2,
      scrollback: 5_000,
      smoothScrollDuration: 0,
      theme: interactiveTerminalTheme(
        getComputedStyle(document.documentElement),
      ),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    const acceleration = attachTerminalAcceleration(terminal);
    terminal.open(viewport);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    xtermTabIdRef.current = tab.id;
    terminal.write(tab.output);
    requestAnimationFrame(() => {
      fitTerminalToViewport();
    });
    void acceleration.ready.then((enabled) => {
      if (!enabled || xtermRef.current !== terminal) return;
      requestAnimationFrame(() => fitTerminalToViewport());
    });
    if ("fonts" in document) {
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          if (xtermRef.current !== terminal) return;
          fitTerminalToViewport();
        });
      });
    }

    const disposable = terminal.onData((data) => {
      const activeTab = tabsRef.current.find(
        (candidate) => candidate.id === activeTabIdRef.current,
      );
      if (!activeTab?.sessionId || activeTab.state !== "running") return;
      const sessionId = activeTab.sessionId;
      const operation = ownsSessionOperation(activeTab.id, sessionId);
      inputSequenceRef.current = inputSequenceRef.current
        .then(() => {
          if (
            !operation.ownsRecord() ||
            !tabsRef.current.some(
              (tab) =>
                tab.id === activeTab.id &&
                tab.sessionId === sessionId &&
                tab.state === "running",
            )
          )
            return;
          return window.doolittle.writeInteractiveTerminal({
            ...(botId ? { botId } : {}),
            sessionId,
            data,
          });
        })
        .then(async () => {
          if (!operation.ownsRecord()) return;
          const latest = tabsRef.current.find(
            (candidate) => candidate.id === activeTab.id,
          );
          if (!latest || latest.sessionId !== sessionId) return;
          await pollOutputRef.current?.(activeTab.id, sessionId, latest.cursor);
        })
        .catch((error) => {
          if (operation.ownsPresentation()) setNotice(errorMessage(error));
        });
    });

    return () => {
      disposable.dispose();
      acceleration.dispose();
      terminal.dispose();
      if (terminalWriteFrameRef.current !== null) {
        cancelAnimationFrame(terminalWriteFrameRef.current);
        terminalWriteFrameRef.current = null;
      }
      pendingTerminalWriteRef.current = "";
      xtermRef.current = null;
      fitAddonRef.current = null;
      xtermTabIdRef.current = null;
    };
  }, [activeTabId, fitTerminalToViewport, botId, ownsSessionOperation]);

  useEffect(() => {
    const updateTheme = () => {
      const terminal = xtermRef.current;
      if (!terminal) return;
      terminal.options.theme = interactiveTerminalTheme(
        getComputedStyle(document.documentElement),
      );
    };
    window.addEventListener(THEME_CHANGE_EVENT, updateTheme);
    window.addEventListener(APPEARANCE_APPLIED_EVENT, updateTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, updateTheme);
      window.removeEventListener(APPEARANCE_APPLIED_EVENT, updateTheme);
    };
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const running = activeTab?.state === "running";

  const setTabToClosed = useCallback((tabId: string, sessionId: string) => {
    setTabs((current) => {
      const next = current.map((tab) =>
        tab.id === tabId && tab.sessionId === sessionId
          ? { ...tab, state: "closed" as const, sessionId: null, stale: true }
          : tab,
      );
      tabsRef.current = next;
      return next;
    });
    setIsClosingTab((current) => ({ ...current, [tabId]: false }));
    if (activeTabIdRef.current === tabId)
      setNotice("Terminal session is no longer available.");
  }, []);

  const queueTerminalWrite = useCallback((tabId: string, data: string) => {
    if (!data || xtermTabIdRef.current !== tabId) return;
    pendingTerminalWriteRef.current += data;
    if (terminalWriteFrameRef.current !== null) return;
    terminalWriteFrameRef.current = requestAnimationFrame(() => {
      terminalWriteFrameRef.current = null;
      const pending = pendingTerminalWriteRef.current;
      pendingTerminalWriteRef.current = "";
      if (pending && xtermTabIdRef.current === tabId) {
        xtermRef.current?.write(pending);
      }
    });
  }, []);

  const appendOutputToTab = useCallback(
    (tabId: string, snapshot: InteractiveTerminalOutput) => {
      const chunks = snapshot.chunks.map((chunk) => chunk.data).join("");
      if (!chunks && !snapshot.truncatedBeforeCursor) {
        const current = tabsRef.current.find((tab) => tab.id === tabId);
        if (current && terminalLifecycleChanged(current, snapshot.session))
          syncSession(tabId, snapshot.session);
        if (activeTabIdRef.current === tabId) setNotice("");
        return;
      }
      queueTerminalWrite(
        tabId,
        `${snapshot.truncatedBeforeCursor ? "\r\n[Doolittle retained the newest terminal output.]\r\n" : ""}${chunks}`,
      );
      setTabs((current) => {
        const next = current.map((tab) => {
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
        });
        tabsRef.current = next;
        return next;
      });
      if (activeTabIdRef.current === tabId) setNotice("");
    },
    [queueTerminalWrite, syncSession],
  );

  const pollOutput = useCallback(
    async (
      tabId: string,
      sessionId: string,
      cursor: number,
      allowExited = false,
    ): Promise<TerminalPollResult> => {
      if (!sessionId) return { hadOutput: false, nextDelay: null };
      const workspaceGeneration = workspaceGenerationRef.current;
      const inFlight = pollInFlightRef.current;
      if (
        inFlight?.generation === workspaceGeneration &&
        inFlight.tabId === tabId &&
        inFlight.sessionId === sessionId
      )
        return inFlight.promise;
      const recovery = pollRecoveryRef.current;
      if (recovery.sessionId === sessionId) {
        if (recovery.stopped) return { hadOutput: false, nextDelay: null };
        if (recovery.nextAt > Date.now()) {
          return { hadOutput: false, nextDelay: recovery.nextAt - Date.now() };
        }
      }
      const ownsPoll = () =>
        mountedRef.current &&
        workspaceGenerationRef.current === workspaceGeneration &&
        isCurrentTerminalSession(tabsRef.current, tabId, sessionId) &&
        tabsRef.current.some(
          (tab) =>
            tab.id === tabId &&
            tab.sessionId === sessionId &&
            (tab.state === "running" ||
              (allowExited && tab.state === "exited")),
        );
      const ownsPresentation = () =>
        ownsPoll() && activeTabIdRef.current === tabId;
      const request = (async (): Promise<TerminalPollResult> => {
        try {
          const receipt = await window.doolittle.getInteractiveTerminalOutput(
            sessionId,
            cursor,
            botId,
          );
          if (!ownsPoll()) return { hadOutput: false, nextDelay: null };
          if (receipt.status === "absent") {
            if (receipt.sessionId !== sessionId) {
              if (ownsPresentation()) {
                setNotice(
                  "Terminal status returned a different session. Current session preserved.",
                );
                pollRecoveryRef.current = {
                  sessionId,
                  nextAt: 0,
                  stopped: true,
                };
                setRetryAvailable(true);
              }
              return { hadOutput: false, nextDelay: null };
            }
            setTabToClosed(tabId, sessionId);
            return { hadOutput: false, nextDelay: null };
          }
          if (receipt.status === "unconfirmed") {
            if (!ownsPresentation())
              return { hadOutput: false, nextDelay: null };
            const previousFailures =
              pollFailuresRef.current.sessionId === sessionId
                ? pollFailuresRef.current.count
                : 0;
            const nextDelay =
              receipt.sessionId === sessionId
                ? terminalOutputRecoveryDelay(
                    receipt.retryable,
                    previousFailures,
                  )
                : null;
            pollFailuresRef.current = {
              sessionId,
              count: previousFailures + 1,
            };
            pollRecoveryRef.current = {
              sessionId,
              nextAt: nextDelay === null ? 0 : Date.now() + nextDelay,
              stopped: nextDelay === null,
            };
            setRetryAvailable(nextDelay === null);
            setNotice(
              `Terminal output could not be confirmed. Session preserved. ${receipt.message}`,
            );
            return { hadOutput: false, nextDelay };
          }
          const snapshot = receipt.output;
          if (snapshot.session.id !== sessionId) {
            if (ownsPresentation()) {
              setNotice(
                "Terminal output returned a different session. The current session was preserved.",
              );
              pollRecoveryRef.current = { sessionId, nextAt: 0, stopped: true };
              setRetryAvailable(true);
            }
            return { hadOutput: false, nextDelay: null };
          }
          const hadOutput =
            snapshot.truncatedBeforeCursor || snapshot.chunks.length > 0;
          if (ownsPresentation()) {
            pollFailuresRef.current = { sessionId, count: 0 };
            pollRecoveryRef.current = { sessionId, nextAt: 0, stopped: false };
            setRetryAvailable(false);
          }
          appendOutputToTab(tabId, snapshot);
          return {
            hadOutput,
            nextDelay:
              ownsPresentation() && !allowExited
                ? interactiveTerminalPollDelay({ hadOutput, visible: true })
                : null,
          };
        } catch (error) {
          if (!ownsPoll()) return { hadOutput: false, nextDelay: null };
          if (ownsPresentation()) {
            setNotice(
              `Terminal output could not be confirmed. Session preserved. ${errorMessage(error)}`,
            );
            pollRecoveryRef.current = { sessionId, nextAt: 0, stopped: true };
            setRetryAvailable(true);
          }
          return { hadOutput: false, nextDelay: null };
        }
      })();
      pollInFlightRef.current = {
        generation: workspaceGeneration,
        tabId,
        sessionId,
        promise: request,
      };
      void request.finally(() => {
        if (pollInFlightRef.current?.promise === request)
          pollInFlightRef.current = null;
      });
      return request;
    },
    [appendOutputToTab, botId, setTabToClosed],
  );

  const reconcileExitedOutput = useCallback(
    (tabId: string, sessionId: string) => {
      if (exitedPollTimerRef.current) clearTimeout(exitedPollTimerRef.current);
      const generation = workspaceGenerationRef.current;
      const tick = async () => {
        exitedPollTimerRef.current = null;
        const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
        if (
          !mountedRef.current ||
          workspaceGenerationRef.current !== generation ||
          tab?.sessionId !== sessionId ||
          tab.state !== "exited"
        )
          return;
        const result = await pollOutput(tabId, sessionId, tab.cursor, true);
        if (
          result.nextDelay !== null &&
          mountedRef.current &&
          workspaceGenerationRef.current === generation &&
          tabsRef.current.some(
            (candidate) =>
              candidate.id === tabId &&
              candidate.sessionId === sessionId &&
              candidate.state === "exited",
          )
        ) {
          exitedPollTimerRef.current = setTimeout(
            () => void tick(),
            result.nextDelay,
          );
        }
      };
      // Let the confirmed session update commit before the first read.
      exitedPollTimerRef.current = setTimeout(() => void tick(), 0);
    },
    [pollOutput],
  );

  useEffect(() => {
    pollOutputRef.current = pollOutput;
    return () => {
      if (pollOutputRef.current === pollOutput) pollOutputRef.current = null;
    };
  }, [pollOutput]);

  const onStart = useCallback(
    async (event?: MouseEvent<HTMLButtonElement>) => {
      if (!activeTab || starting || !active) return;
      if (!origin) {
        setNotice("Select a bot conversation before opening a terminal.");
        return;
      }
      const startControl = event?.currentTarget;
      const focusAtStart = document.activeElement;
      const terminalAtStart = xtermRef.current;
      const requestId = ++startRequestRef.current;
      const ownsStart = () =>
        mountedRef.current &&
        startRequestRef.current === requestId &&
        focusContextRef.current.workspacePath === workspacePath;
      const ownsStartPresentation = () =>
        ownsStart() && activeTabIdRef.current === activeTab.id;
      setStarting(true);
      setNotice(
        activeTab.pendingStart
          ? "Checking previous shell request…"
          : "Opening workspace shell…",
      );
      try {
        const dimensions = fitTerminalToViewport();
        const pendingStart = activeTab.pendingStart ?? {
          requestId: `${Date.now()}.${crypto.randomUUID()}`,
          cols: dimensions.cols,
          rows: dimensions.rows,
        };
        if (!activeTab.pendingStart) {
          const nextTabs = tabsRef.current.map((tab) =>
            tab.id === activeTab.id ? { ...tab, pendingStart } : tab,
          );
          tabsRef.current = nextTabs;
          setTabs(nextTabs);
          saveInteractiveTerminalState(
            workspacePath,
            { activeTabId: activeTabIdRef.current, tabs: nextTabs },
            storage,
            ownerKey,
          );
        }
        inFlightStartRef.current = {
          sequence: requestId,
          tabId: activeTab.id,
          requestId: pendingStart.requestId,
        };
        const result = await window.doolittle.startInteractiveTerminal({
          ...pendingStart,
          ...(activeTab.pendingStart ? { reconcileOnly: true } : {}),
          botId: origin.botId,
          originConversationId: origin.originConversationId,
          workspacePath: origin.workspacePath,
        });
        if (!ownsStart()) return;
        if (result.status === "unconfirmed") {
          if (ownsStartPresentation())
            setNotice(
              result.requestId === pendingStart.requestId
                ? `Shell creation could not be confirmed. Retry shell request with the same ID. ${result.message}`
                : "Shell creation returned a different request ID. Current request preserved.",
            );
          return;
        }
        const session = result.session;
        setPendingDiscard((current) =>
          current?.tabId === activeTab.id ? null : current,
        );
        updateTab(activeTab.id, (tab) =>
          ownsStart()
            ? {
                ...tab,
                pendingStart: null,
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
              }
            : tab,
        );
        setIsClosingTab((current) => ({ ...current, [activeTab.id]: false }));
        setNotice((current) => (ownsStartPresentation() ? "" : current));
        const viewport = viewportRef.current;
        const focusNow = document.activeElement;
        // A late start must not reclaim another view, tab, or toolbar control.
        // Native disabling of the explicit start button may blur it to body.
        const startStillOwnsFocus =
          startControl &&
          (focusNow === focusAtStart ||
            (focusAtStart === startControl &&
              startControl.disabled &&
              focusNow === document.body));
        if (
          focusContextRef.current.active &&
          focusContextRef.current.workspacePath === workspacePath &&
          activeTabIdRef.current === activeTab.id &&
          xtermTabIdRef.current === activeTab.id &&
          xtermRef.current === terminalAtStart &&
          viewport?.isConnected &&
          !viewport.closest('[inert], [hidden], [aria-hidden="true"]') &&
          document.visibilityState !== "hidden" &&
          (viewport.contains(focusNow) || startStillOwnsFocus)
        ) {
          terminalAtStart?.focus();
        }
        if (session.state === "exited")
          reconcileExitedOutput(activeTab.id, session.id);
        else void pollOutput(activeTab.id, session.id, 0);
      } catch (error) {
        if (ownsStartPresentation()) {
          setNotice((current) =>
            ownsStartPresentation() ? errorMessage(error) : current,
          );
        }
      } finally {
        if (inFlightStartRef.current?.sequence === requestId)
          inFlightStartRef.current = null;
        if (ownsStart()) {
          setStarting((current) => (ownsStart() ? false : current));
        }
      }
    },
    [
      active,
      activeTab,
      fitTerminalToViewport,
      pollOutput,
      reconcileExitedOutput,
      starting,
      updateTab,
      workspacePath,
      origin,
      ownerKey,
      storage,
    ],
  );

  useEffect(() => {
    if (!autoStart || !active || !activeTab || running || starting) return;
    if (!isPristineTerminalTab(activeTab)) return;
    if (autoStartedTabRef.current === activeTab.id) return;
    autoStartedTabRef.current = activeTab.id;
    void onStart();
  }, [active, activeTab, autoStart, onStart, running, starting]);

  const onInterrupt = async () => {
    if (!activeTab?.sessionId) return;
    const operation = ownsSessionOperation(activeTab.id, activeTab.sessionId);
    try {
      const session = await window.doolittle.interruptInteractiveTerminal(
        activeTab.sessionId,
        botId,
      );
      if (!operation.ownsRecord() || session.id !== activeTab.sessionId) return;
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
      if (operation.ownsPresentation())
        setNotice("Sent Ctrl+C to the foreground process.");
    } catch (error) {
      if (operation.ownsPresentation()) setNotice(errorMessage(error));
    }
  };

  const onCloseActiveSession = async () => {
    if (!activeTab?.sessionId) return;
    const operation = ownsSessionOperation(activeTab.id, activeTab.sessionId);
    try {
      const session = await window.doolittle.closeInteractiveTerminal(
        activeTab.sessionId,
        botId,
      );
      if (!operation.ownsRecord() || session.id !== activeTab.sessionId) return;
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
      if (operation.ownsPresentation()) setNotice("Terminal session closed.");
    } catch (error) {
      if (operation.ownsPresentation()) setNotice(errorMessage(error));
    }
  };

  const closeTab = async (tabId: string) => {
    const target = tabsRef.current.find((tab) => tab.id === tabId);
    if (!target) return;
    if (target.pendingStart) {
      setPendingDiscard({
        tabId,
        requestId: target.pendingStart.requestId,
        ownerKey,
        workspacePath,
        generation: workspaceGenerationRef.current,
      });
      return;
    }
    const hasClose = isClosingTab[target.id] ?? false;
    if (hasClose) return;

    const operation = target.sessionId
      ? ownsSessionOperation(target.id, target.sessionId)
      : null;
    if (target.sessionId && target.state === "running") {
      setIsClosingTab((current) => ({ ...current, [tabId]: true }));
      try {
        const session = await window.doolittle.closeInteractiveTerminal(
          target.sessionId,
          botId,
        );
        if (!operation?.ownsRecord() || session.id !== target.sessionId) return;
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
        if (operation?.ownsPresentation()) setNotice(errorMessage(error));
        if (operation?.ownsRecord())
          setIsClosingTab((current) => ({ ...current, [tabId]: false }));
        return;
      }
    }

    if (operation && !operation.ownsRecord()) return;
    const closingActiveTab = activeTabIdRef.current === tabId;

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
    if (closingActiveTab) setNotice(`Closed terminal ${target.name}.`);
  };

  const confirmDiscardPendingTab = () => {
    if (!pendingDiscard) return;
    setPendingDiscard(null);
    const target = pendingTerminalDiscardTarget(
      tabsRef.current,
      pendingDiscard,
      {
        ownerKey: loadedOwnerKeyRef.current,
        workspacePath: loadedWorkspaceRef.current,
        generation: workspaceGenerationRef.current,
        mounted: mountedRef.current,
      },
    );
    if (!target) return;
    // Discarding the recovery identity must not let a late start receipt
    // claim this tab's replacement or imply the underlying shell stopped.
    if (
      inFlightStartRef.current?.tabId === target.id &&
      inFlightStartRef.current.requestId === target.pendingStart?.requestId
    ) {
      startRequestRef.current++;
      inFlightStartRef.current = null;
      setStarting(false);
    }
    const fallbackTab = createInteractiveTerminalTab(nextTabName(0));
    fallbackTab.cwd = workspacePath || fallbackTab.cwd;
    const reconciled = closeTerminalTabState({
      tabs: tabsRef.current,
      activeTabId: activeTabIdRef.current,
      tabId: target.id,
      fallbackTab,
    });
    const nextTabs = preserveTabs(workspacePath, reconciled.tabs);
    tabsRef.current = nextTabs;
    activeTabIdRef.current = reconciled.activeTabId;
    saveInteractiveTerminalState(
      workspacePath,
      { activeTabId: reconciled.activeTabId, tabs: nextTabs },
      storage,
      ownerKey,
    );
    setTabs(nextTabs);
    setActiveTabId(reconciled.activeTabId);
    setNotice(
      "Discarded tab only. The shell may still be running; use Stop work or quit Doolittle to shut it down.",
    );
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
    const selected = tabsRef.current.find((tab) => tab.id === tabId);
    if (!selected) return;
    // Selecting a tab is an explicit read-only reconciliation point. Do not
    // carry another tab's stopped poll state into the newly selected session.
    if (pollRecoveryRef.current.sessionId !== selected.sessionId) {
      pollRecoveryRef.current = { sessionId: "", nextAt: 0, stopped: false };
      pollFailuresRef.current = { sessionId: "", count: 0 };
      setRetryAvailable(false);
    }
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
    setNotice(selected.pendingStart ? PENDING_START_NOTICE : "");
    // An exited receipt can arrive while another tab is selected. Its first
    // output read has no presentation for an uncertain result, so selecting
    // this tab is the explicit read-only recovery point.
    if (selected.state === "exited" && selected.sessionId)
      reconcileExitedOutput(selected.id, selected.sessionId);
    // Every tab already exists in the DOM. Move focus with selection so the
    // next key reaches that tab; xterm recreation must not claim toolbar focus.
    tabRefs.current[tabId]?.focus();
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

  const retryOutput = () => {
    if (
      !active ||
      !activeTab?.sessionId ||
      !["running", "exited"].includes(activeTab.state)
    )
      return;
    // The retry control appears only after a settled, stopped receipt.
    pollInFlightRef.current = null;
    pollFailuresRef.current = { sessionId: activeTab.sessionId, count: 0 };
    pollRecoveryRef.current = {
      sessionId: activeTab.sessionId,
      nextAt: 0,
      stopped: false,
    };
    setRetryAvailable(false);
    setNotice("Checking terminal output…");
    if (activeTab.state === "exited")
      reconcileExitedOutput(activeTab.id, activeTab.sessionId);
    else {
      setPollEpoch((current) => current + 1);
      void pollOutput(activeTab.id, activeTab.sessionId, activeTab.cursor);
    }
  };

  useEffect(() => {
    const tabId = activeTab?.id;
    if (!active || !running || !activeSessionId || !tabId) return;
    let cancelled = false;
    let ticking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ownsLoop = () => !cancelled && pollEpochRef.current === pollEpoch;

    const schedule = (delay: number) => {
      if (!ownsLoop()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), delay);
    };
    const tick = async () => {
      if (!ownsLoop()) return;
      timer = undefined;
      ticking = true;
      const visible = document.visibilityState !== "hidden";
      if (!visible) {
        ticking = false;
        schedule(
          interactiveTerminalPollDelay({ hadOutput: false, visible: false }),
        );
        return;
      }
      const latest = tabsRef.current.find((tab) => tab.id === tabId);
      if (!latest || latest.sessionId !== activeSessionId) {
        ticking = false;
        return;
      }
      const result = await pollOutput(tabId, activeSessionId, latest.cursor);
      ticking = false;
      if (!ownsLoop()) return;
      if (result.nextDelay !== null) schedule(result.nextDelay);
    };
    const wake = () => {
      if (ticking) return;
      schedule(0);
    };

    document.addEventListener("visibilitychange", wake);
    schedule(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [active, activeSessionId, activeTab?.id, pollOutput, pollEpoch, running]);

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
    const operation =
      resizeTabId && resizeSessionId
        ? ownsSessionOperation(resizeTabId, resizeSessionId)
        : null;
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
          !operation?.ownsRecord() ||
          (activeTab?.cols === dimensions.cols &&
            activeTab?.rows === dimensions.rows)
        ) {
          return;
        }
        void window.doolittle
          .resizeInteractiveTerminal({
            ...(botId ? { botId } : {}),
            sessionId: resizeSessionId,
            cols: dimensions.cols,
            rows: dimensions.rows,
          })
          .then((session) => {
            if (!operation.ownsRecord() || session.id !== resizeSessionId)
              return;
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
            });
          })
          .catch((error) => {
            if (operation.ownsPresentation()) setNotice(errorMessage(error));
          });
      }, 28);
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
    botId,
    fitTerminalToViewport,
    ownsSessionOperation,
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
        onClearOutput={() => {
          if (!activeTab) return;
          xtermRef.current?.clear();
          updateTab(activeTab.id, (tab) => ({ ...tab, output: "" }));
        }}
        onCloseActiveSession={onCloseActiveSession}
        onCloseTab={closeTab}
        onCreateTab={createTab}
        onDismiss={onDismiss}
        onInterrupt={onInterrupt}
        onRenameChange={setRenamingValue}
        onSaveRename={saveRename}
        onSendOutputToChat={() => {
          if (activeTab?.output) {
            onSendToChat(terminalChatContext(activeTab.output));
          }
        }}
        onSelectTab={selectTab}
        onStart={onStart}
        onTabKeyDown={onTabKeyDown}
        renameInputRef={renameInputRef}
        renamingTabId={renamingTabId}
        renamingValue={renamingValue}
        running={running}
        outputAvailable={Boolean(activeTab?.output)}
        starting={starting}
        pendingStart={Boolean(activeTab?.pendingStart)}
        tabRefs={tabRefs}
        tabs={tabs}
      />
      <InteractiveTerminalSurface
        active={active}
        activeTab={activeTab}
        discardConfirmation={
          pendingDiscard
            ? {
                tabName:
                  tabs.find((tab) => tab.id === pendingDiscard.tabId)?.name ??
                  "terminal",
                onCancel: () => setPendingDiscard(null),
                onConfirm: confirmDiscardPendingTab,
              }
            : null
        }
        notice={notice}
        onStart={onStart}
        onRetryOutput={retryOutput}
        canRetryOutput={Boolean(
          active &&
            (running || activeTab?.state === "exited") &&
            activeSessionId &&
            pollRecoveryRef.current.sessionId === activeSessionId &&
            retryAvailable,
        )}
        running={running}
        starting={starting}
        pendingStart={Boolean(activeTab?.pendingStart)}
        viewportRef={viewportRef}
      />
    </section>
  );
}
