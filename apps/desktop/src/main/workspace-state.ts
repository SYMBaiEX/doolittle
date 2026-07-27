import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { WorkspacePickResult, WorkspaceState } from "../shared/contracts";

export const MAX_RECENT_WORKSPACES = 8;
const MAX_STATE_FILE_BYTES = 64_000;

export interface DirectoryPickerResult {
  canceled: boolean;
  filePaths: string[];
}

function workspacePathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function recentPathLimit(maxRecent: number): number {
  return Math.max(1, Math.min(Math.trunc(maxRecent), 32));
}

export function normalizeWorkspaceDirectory(path: string): string {
  const candidate = path.trim();
  if (!candidate) throw new Error("A workspace directory is required.");
  const resolved = realpathSync(resolve(candidate));
  if (!statSync(resolved).isDirectory()) {
    throw new Error("The selected workspace is not a directory.");
  }
  return resolved;
}

export function recordWorkspaceSelection(
  state: WorkspaceState,
  selectedPath: string,
  maxRecent = MAX_RECENT_WORKSPACES,
): WorkspaceState {
  const limit = recentPathLimit(maxRecent);
  const selectedKey = workspacePathKey(selectedPath);
  const recentPaths = [
    selectedPath,
    ...state.recentPaths.filter(
      (path) => workspacePathKey(path) !== selectedKey,
    ),
  ].slice(0, limit);
  return {
    currentPath: selectedPath,
    recentPaths,
  };
}

function normalizePersistedState(
  value: unknown,
  fallbackPath: string,
  maxRecent: number,
): WorkspaceState {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawCurrent =
    typeof record.currentPath === "string" ? record.currentPath : "";
  let currentPath = fallbackPath;
  try {
    if (rawCurrent) currentPath = normalizeWorkspaceDirectory(rawCurrent);
  } catch {
    currentPath = fallbackPath;
  }

  const candidates = Array.isArray(record.recentPaths)
    ? record.recentPaths
    : [];
  const limit = recentPathLimit(maxRecent);
  const recentPaths: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [currentPath, ...candidates]) {
    if (typeof candidate !== "string") continue;
    try {
      const normalized = normalizeWorkspaceDirectory(candidate);
      const key = workspacePathKey(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      recentPaths.push(normalized);
      if (recentPaths.length >= limit) break;
    } catch {
      // Missing recent workspaces are omitted from the persisted navigation.
    }
  }

  return {
    currentPath,
    recentPaths,
  };
}

export function loadWorkspaceState(
  statePath: string,
  fallbackPath: string,
  maxRecent = MAX_RECENT_WORKSPACES,
): WorkspaceState {
  const normalizedFallback = normalizeWorkspaceDirectory(fallbackPath);
  try {
    const contents = readFileSync(statePath, "utf8");
    if (contents.length > MAX_STATE_FILE_BYTES) {
      return {
        currentPath: normalizedFallback,
        recentPaths: [normalizedFallback],
      };
    }
    return normalizePersistedState(
      JSON.parse(contents) as unknown,
      normalizedFallback,
      maxRecent,
    );
  } catch {
    return {
      currentPath: normalizedFallback,
      recentPaths: [normalizedFallback],
    };
  }
}

export function saveWorkspaceState(
  statePath: string,
  state: WorkspaceState,
): void {
  mkdirSync(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, statePath);
}

export class WorkspaceStateManager {
  private state: WorkspaceState;
  private readonly listeners = new Set<(state: WorkspaceState) => void>();

  constructor(
    private readonly statePath: string,
    fallbackPath: string,
    private readonly maxRecent = MAX_RECENT_WORKSPACES,
  ) {
    this.state = loadWorkspaceState(statePath, fallbackPath, maxRecent);
  }

  getState(): WorkspaceState {
    return {
      currentPath: this.state.currentPath,
      recentPaths: [...this.state.recentPaths],
    };
  }

  subscribe(listener: (state: WorkspaceState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  applyPickerResult(result: DirectoryPickerResult): WorkspacePickResult {
    if (result.canceled) {
      return {
        canceled: true,
        state: this.getState(),
      };
    }
    const selectedPath = result.filePaths[0];
    if (!selectedPath) {
      throw new Error("The directory picker did not return a workspace.");
    }
    const normalizedPath = normalizeWorkspaceDirectory(selectedPath);
    const next = recordWorkspaceSelection(
      this.state,
      normalizedPath,
      this.maxRecent,
    );
    saveWorkspaceState(this.statePath, next);
    this.state = next;
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
    return {
      canceled: false,
      state: snapshot,
    };
  }
}
