import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type { WorkspacePickResult, WorkspaceState } from "../shared/contracts";

export const MAX_RECENT_WORKSPACES = 8;
const MAX_STATE_FILE_BYTES = 64_000;

export interface WorkspaceStateLoadOptions {
  maxRecent?: number;
  selectFallback?: boolean;
}

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
  selectFallback: boolean,
): WorkspaceState {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawCurrent =
    typeof record.currentPath === "string" ? record.currentPath : "";
  let currentPath = selectFallback ? fallbackPath : "";
  try {
    if (rawCurrent) currentPath = normalizeWorkspaceDirectory(rawCurrent);
  } catch {
    currentPath = selectFallback ? fallbackPath : "";
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
  {
    maxRecent = MAX_RECENT_WORKSPACES,
    selectFallback = true,
  }: WorkspaceStateLoadOptions = {},
): WorkspaceState {
  const normalizedFallback = normalizeWorkspaceDirectory(fallbackPath);
  const fallbackState = selectFallback
    ? {
        currentPath: normalizedFallback,
        recentPaths: [normalizedFallback],
      }
    : { currentPath: "", recentPaths: [] };
  try {
    const contents = readFileSync(statePath, "utf8");
    if (contents.length > MAX_STATE_FILE_BYTES) {
      return fallbackState;
    }
    return normalizePersistedState(
      JSON.parse(contents) as unknown,
      normalizedFallback,
      maxRecent,
      selectFallback,
    );
  } catch {
    return fallbackState;
  }
}

export function saveWorkspaceState(
  statePath: string,
  state: WorkspaceState,
): void {
  writeJsonAtomicSync(statePath, state, { trailingNewline: true });
}

export class WorkspaceStateManager {
  private state: WorkspaceState;
  private readonly maxRecent: number;
  private readonly listeners = new Set<(state: WorkspaceState) => void>();

  constructor(
    private readonly statePath: string,
    fallbackPath: string,
    options: WorkspaceStateLoadOptions = {},
  ) {
    this.maxRecent = options.maxRecent ?? MAX_RECENT_WORKSPACES;
    this.state = loadWorkspaceState(statePath, fallbackPath, options);
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
