import type { InteractiveTerminalSessionState } from "../../shared/contracts";
import { isPlainObject } from "../value-guards";

export const INTERACTIVE_TERMINAL_STORAGE_PREFIX =
  "doolittle.desktop.interactive-terminal.v2:";
export const MAX_INTERACTIVE_TERMINAL_TABS = 4;
export const MAX_TERMINAL_COMMAND_HISTORY = 100;
export const MAX_RENDERED_TERMINAL_OUTPUT = 500_000;
const MAX_TAB_NAME_LENGTH = 48;

export interface InteractiveTerminalTabState {
  id: string;
  name: string;
  sessionId: string | null;
  state: InteractiveTerminalSessionState;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  pty: boolean;
  supportsResize: boolean;
  outputBytes: number;
  cursor: number;
  output: string;
  commandHistory: string[];
  stale: boolean;
}

export interface InteractiveTerminalWorkspaceState {
  activeTabId: string;
  tabs: InteractiveTerminalTabState[];
}

export interface ResolveInteractiveTerminalWorkspaceStateInput {
  previousWorkspacePath: string;
  nextWorkspacePath: string;
  currentState: InteractiveTerminalWorkspaceState;
  storage?: Storage;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function toStringOrDefault(value: unknown, fallback: string): string {
  return isString(value) ? value : fallback;
}

function trimString(value: unknown, fallback: string): string {
  const next = toStringOrDefault(value, "").trim();
  return next || fallback;
}

function truncateHistory(value: unknown, maxEntries: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isString)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxEntries);
}

function truncateOutput(value: unknown, maxCharacters: number): string {
  if (!isString(value)) return "";
  return value
    .replace(
      /\[Terminal [\da-f-]{1,8} cannot be polled after navigation\.\](?:\r\n|\n|\r)?/giu,
      "",
    )
    .slice(-maxCharacters);
}

function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function normalizeWorkspaceStoragePath(workspacePath: string): string {
  return (workspacePath || "workspace").trim() || "workspace";
}

export function interactiveTerminalStorageKey(workspacePath: string): string {
  return `${INTERACTIVE_TERMINAL_STORAGE_PREFIX}${encodeURIComponent(
    normalizeWorkspaceStoragePath(workspacePath),
  )}`;
}

export function createInteractiveTerminalTab(
  name?: string,
): InteractiveTerminalTabState {
  const cleanName = trimString(name, "Terminal").slice(0, MAX_TAB_NAME_LENGTH);
  return {
    id: randomId(),
    name: cleanName,
    sessionId: null,
    state: "closed",
    shell: "Terminal",
    cwd: "Unknown",
    cols: 100,
    rows: 30,
    startedAt: "",
    completedAt: null,
    exitCode: null,
    pty: false,
    supportsResize: true,
    outputBytes: 0,
    cursor: 0,
    output: "",
    commandHistory: [],
    stale: false,
  };
}

export function browserInteractiveTerminalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function parseInteractiveTerminalState(
  value: unknown,
): InteractiveTerminalWorkspaceState {
  const fallback = {
    activeTabId: "",
    tabs: [createInteractiveTerminalTab("Terminal 1")],
  } satisfies InteractiveTerminalWorkspaceState;

  if (!isPlainObject(value)) return fallback;
  const rawTabs = Array.isArray(value.tabs) ? value.tabs : [];

  const normalizedTabs = rawTabs
    .map((entry): InteractiveTerminalTabState | null => {
      if (!isPlainObject(entry)) return null;
      const id = trimString(entry.id, "").trim();
      if (!id) return null;
      const name = trimString(entry.name, "Terminal").slice(
        0,
        MAX_TAB_NAME_LENGTH,
      );
      const commandHistory = truncateHistory(
        entry.commandHistory,
        MAX_TERMINAL_COMMAND_HISTORY,
      );
      const output = truncateOutput(entry.output, MAX_RENDERED_TERMINAL_OUTPUT);
      const cursor = Number.isFinite(entry.cursor)
        ? Math.max(0, Number(entry.cursor))
        : 0;

      return {
        id,
        name,
        sessionId: isString(entry.sessionId) ? entry.sessionId : null,
        state:
          entry.state === "running" || entry.state === "exited"
            ? entry.state
            : "closed",
        shell: trimString(entry.shell, "Terminal"),
        cwd: trimString(entry.cwd, "Unknown"),
        cols: Number.isFinite(entry.cols)
          ? Math.max(20, Math.min(400, Number(entry.cols)))
          : 100,
        rows: Number.isFinite(entry.rows)
          ? Math.max(5, Math.min(200, Number(entry.rows)))
          : 30,
        startedAt: toStringOrDefault(entry.startedAt, ""),
        completedAt: isString(entry.completedAt) ? entry.completedAt : null,
        exitCode:
          typeof entry.exitCode === "number" && Number.isFinite(entry.exitCode)
            ? entry.exitCode
            : null,
        pty: entry.pty === true,
        supportsResize: entry.supportsResize !== false,
        outputBytes:
          typeof entry.outputBytes === "number" &&
          Number.isFinite(entry.outputBytes) &&
          entry.outputBytes >= 0
            ? Math.floor(entry.outputBytes)
            : 0,
        cursor,
        output,
        commandHistory,
        stale: entry.stale === true && entry.state !== "running",
      };
    })
    .filter((entry): entry is InteractiveTerminalTabState => entry !== null)
    .slice(0, MAX_INTERACTIVE_TERMINAL_TABS)
    .map((tab, index) => {
      if (tab.name) return tab;
      return { ...tab, name: `Terminal ${index + 1}` };
    });

  if (!normalizedTabs.length) {
    return fallback;
  }

  const activeTabId = toStringOrDefault(
    value.activeTabId,
    normalizedTabs[0].id,
  ).trim();
  const activeTab = normalizedTabs.find((tab) => tab.id === activeTabId);

  return {
    activeTabId: activeTab ? activeTabId : normalizedTabs[0].id,
    tabs: normalizedTabs.map((tab) => ({
      ...tab,
      // A new, untouched terminal tab is intentionally persisted as closed.
      // Only a tab that previously had a real session is stale after reload.
      stale:
        tab.state === "running"
          ? tab.stale
          : Boolean(tab.sessionId) || tab.stale,
    })),
  };
}

function isDefaultTerminalTab(
  tab: InteractiveTerminalTabState,
  index: number,
): boolean {
  return (
    tab.name === `Terminal ${index + 1}` &&
    tab.sessionId === null &&
    tab.state === "closed" &&
    tab.cwd === "Unknown" &&
    tab.output === "" &&
    tab.commandHistory.length === 0 &&
    tab.cursor === 0 &&
    tab.outputBytes === 0 &&
    tab.exitCode === null &&
    tab.completedAt === null &&
    tab.startedAt === "" &&
    tab.stale === false
  );
}

function hasInteractiveTerminalActivity(
  state: InteractiveTerminalWorkspaceState,
): boolean {
  if (state.tabs.length !== 1) return true;
  const [firstTab] = state.tabs;
  if (!firstTab) return false;
  return !isDefaultTerminalTab(firstTab, 0);
}

function migrateInteractiveTerminalTabCwd(
  tab: InteractiveTerminalTabState,
  workspacePath: string,
): InteractiveTerminalTabState {
  if (!workspacePath || tab.cwd !== "Unknown") return tab;
  return {
    ...tab,
    cwd: workspacePath,
  };
}

export function loadInteractiveTerminalState(
  workspacePath: string,
  storage?: Storage,
): InteractiveTerminalWorkspaceState {
  const workspaceDefault = createInteractiveTerminalTab("Terminal 1");
  const fallback = {
    activeTabId: workspaceDefault.id,
    tabs: [workspaceDefault],
  } satisfies InteractiveTerminalWorkspaceState;

  if (!storage) return fallback;
  try {
    const value = storage.getItem(interactiveTerminalStorageKey(workspacePath));
    if (!value) return fallback;
    const parsed = JSON.parse(value) as unknown;
    const normalized = parseInteractiveTerminalState(parsed);
    return {
      ...normalized,
      tabs: normalized.tabs.length
        ? normalized.tabs
        : [createInteractiveTerminalTab("Terminal 1")],
    };
  } catch {
    return fallback;
  }
}

export function resolveInteractiveTerminalWorkspaceState({
  previousWorkspacePath,
  nextWorkspacePath,
  currentState,
  storage,
}: ResolveInteractiveTerminalWorkspaceStateInput): InteractiveTerminalWorkspaceState {
  const previous = previousWorkspacePath.trim();
  const next = nextWorkspacePath.trim();

  if (!previous && next && hasInteractiveTerminalActivity(currentState)) {
    const migratedTabs = currentState.tabs
      .slice(0, MAX_INTERACTIVE_TERMINAL_TABS)
      .map((tab) => migrateInteractiveTerminalTabCwd(tab, next));
    const fallback =
      migratedTabs[0] ?? createInteractiveTerminalTab("Terminal 1");
    const activeTabId = migratedTabs.some(
      (tab) => tab.id === currentState.activeTabId,
    )
      ? currentState.activeTabId
      : fallback.id;
    return {
      activeTabId,
      tabs: migratedTabs.length ? migratedTabs : [fallback],
    };
  }

  return loadInteractiveTerminalState(nextWorkspacePath, storage);
}

export function saveInteractiveTerminalState(
  workspacePath: string,
  state: InteractiveTerminalWorkspaceState,
  storage?: Storage,
): void {
  if (!storage) return;
  try {
    const normalized = {
      activeTabId: state.activeTabId,
      tabs: state.tabs.slice(0, MAX_INTERACTIVE_TERMINAL_TABS).map((tab) => ({
        ...tab,
        name: trimString(tab.name, `Terminal`).slice(0, MAX_TAB_NAME_LENGTH),
        commandHistory: tab.commandHistory.slice(
          0,
          MAX_TERMINAL_COMMAND_HISTORY,
        ),
        output: truncateOutput(tab.output, MAX_RENDERED_TERMINAL_OUTPUT),
        cursor: Math.max(0, Math.floor(tab.cursor)),
      })),
    };
    storage.setItem(
      interactiveTerminalStorageKey(workspacePath),
      JSON.stringify(normalized),
    );
  } catch {
    // localStorage is optional in some renderer profiles.
  }
}
