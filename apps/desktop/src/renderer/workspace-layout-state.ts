import {
  CODE_EXPLORER_WIDTH,
  CODE_EXPLORER_WIDTH_KEY,
  CODE_UTILITY_WIDTH,
  CODE_UTILITY_WIDTH_KEY,
  clampPanelWidth,
  loadPanelWidth,
} from "./panel-layout";

export const WORKSPACE_LAYOUT_STATE_KEY =
  "doolittle.desktop.workspace-layout.v1";
export const LEGACY_EXPLORER_VISIBLE_KEY =
  "doolittle.desktop.code.explorer-visible.v1";
export const LEGACY_UTILITY_VISIBLE_KEY =
  "doolittle.desktop.code.utility-visible.v1";
export const LEGACY_ZEN_MODE_KEY = "doolittle.desktop.code.zen-mode.v1";

const MAX_WORKSPACE_LAYOUTS = 32;
const DEFAULT_SCOPE = "__default__";

export interface WorkspaceLayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CodeWorkspaceLayout {
  explorerVisible: boolean;
  utilityVisible: boolean;
  zenMode: boolean;
  explorerWidth: number;
  utilityWidth: number;
}

interface StoredCodeWorkspaceLayout extends CodeWorkspaceLayout {
  updatedAt: number;
}

interface StoredWorkspaceLayouts {
  version: 1;
  layouts: Record<string, StoredCodeWorkspaceLayout>;
}

function readBoolean(
  storage: Pick<WorkspaceLayoutStorage, "getItem">,
  key: string,
  fallback: boolean,
): boolean {
  const value = storage.getItem(key);
  return value === null ? fallback : value === "true";
}

function defaultLayout(
  storage: Pick<WorkspaceLayoutStorage, "getItem">,
): CodeWorkspaceLayout {
  try {
    return {
      explorerVisible: readBoolean(storage, LEGACY_EXPLORER_VISIBLE_KEY, true),
      utilityVisible: readBoolean(storage, LEGACY_UTILITY_VISIBLE_KEY, true),
      zenMode: readBoolean(storage, LEGACY_ZEN_MODE_KEY, false),
      explorerWidth: loadPanelWidth(
        storage,
        CODE_EXPLORER_WIDTH_KEY,
        CODE_EXPLORER_WIDTH,
      ),
      utilityWidth: loadPanelWidth(
        storage,
        CODE_UTILITY_WIDTH_KEY,
        CODE_UTILITY_WIDTH,
      ),
    };
  } catch {
    return {
      explorerVisible: true,
      utilityVisible: true,
      zenMode: false,
      explorerWidth: CODE_EXPLORER_WIDTH.default,
      utilityWidth: CODE_UTILITY_WIDTH.default,
    };
  }
}

function parseStoredLayouts(
  storage: Pick<WorkspaceLayoutStorage, "getItem">,
): StoredWorkspaceLayouts {
  try {
    const raw = storage.getItem(WORKSPACE_LAYOUT_STATE_KEY);
    if (!raw) return { version: 1, layouts: {} };
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      layouts?: unknown;
    };
    if (
      parsed.version !== 1 ||
      typeof parsed.layouts !== "object" ||
      parsed.layouts === null ||
      Array.isArray(parsed.layouts)
    ) {
      return { version: 1, layouts: {} };
    }
    return {
      version: 1,
      layouts: parsed.layouts as Record<string, StoredCodeWorkspaceLayout>,
    };
  } catch {
    return { version: 1, layouts: {} };
  }
}

function normalizeStoredLayout(
  value: StoredCodeWorkspaceLayout | undefined,
): CodeWorkspaceLayout | null {
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.explorerVisible !== "boolean" ||
    typeof value.utilityVisible !== "boolean" ||
    typeof value.zenMode !== "boolean"
  ) {
    return null;
  }
  return {
    explorerVisible: value.explorerVisible,
    utilityVisible: value.utilityVisible,
    zenMode: value.zenMode,
    explorerWidth: clampPanelWidth(value.explorerWidth, CODE_EXPLORER_WIDTH),
    utilityWidth: clampPanelWidth(value.utilityWidth, CODE_UTILITY_WIDTH),
  };
}

export function workspaceLayoutScope(workspacePath: string): string {
  const normalized = workspacePath
    .trim()
    .normalize("NFC")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  return normalized || DEFAULT_SCOPE;
}

export function loadCodeWorkspaceLayout(
  storage: Pick<WorkspaceLayoutStorage, "getItem">,
  workspacePath: string,
): CodeWorkspaceLayout {
  const stored = parseStoredLayouts(storage);
  return (
    normalizeStoredLayout(
      stored.layouts[workspaceLayoutScope(workspacePath)],
    ) ?? defaultLayout(storage)
  );
}

export function saveCodeWorkspaceLayout(
  storage: WorkspaceLayoutStorage,
  workspacePath: string,
  layout: CodeWorkspaceLayout,
  now = Date.now(),
): void {
  const stored = parseStoredLayouts(storage);
  stored.layouts[workspaceLayoutScope(workspacePath)] = {
    explorerVisible: layout.explorerVisible,
    utilityVisible: layout.utilityVisible,
    zenMode: layout.zenMode,
    explorerWidth: clampPanelWidth(layout.explorerWidth, CODE_EXPLORER_WIDTH),
    utilityWidth: clampPanelWidth(layout.utilityWidth, CODE_UTILITY_WIDTH),
    updatedAt: now,
  };

  const retained = Object.entries(stored.layouts)
    .filter((entry): entry is [string, StoredCodeWorkspaceLayout] => {
      const value = entry[1];
      return Boolean(value && Number.isFinite(value.updatedAt));
    })
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_WORKSPACE_LAYOUTS);

  storage.setItem(
    WORKSPACE_LAYOUT_STATE_KEY,
    JSON.stringify({ version: 1, layouts: Object.fromEntries(retained) }),
  );
}
