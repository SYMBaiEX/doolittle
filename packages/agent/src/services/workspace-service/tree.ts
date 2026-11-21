import { type Dirent, readdirSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { setImmediate } from "node:timers/promises";
import type { WorkspaceEntry } from "../../types/index";
import { workspaceRelativePath } from "./path-format";
import { isWorkspacePathVisible } from "./policy";

export const DEFAULT_ASYNC_WORKSPACE_TREE_LIMIT = 5_000;

export interface WorkspaceTreeSnapshot {
  entries: WorkspaceEntry[];
  truncated: boolean;
}

export function listWorkspaceTree(
  workspaceDir: string,
  maxDepth: number,
  maxEntries = Number.POSITIVE_INFINITY,
): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  walkWorkspaceTree(workspaceDir, "", 0, maxDepth, maxEntries, entries);
  return entries;
}

/**
 * Builds an operator-facing tree without monopolizing the runtime event loop.
 *
 * The synchronous traversal remains available for small prompt summaries and
 * compatibility callers. Desktop/API surfaces use this bounded variant so a
 * large selected workspace cannot stall unrelated chat and control routes.
 */
export async function listWorkspaceTreeAsync(
  workspaceDir: string,
  maxDepth: number,
  maxEntries = DEFAULT_ASYNC_WORKSPACE_TREE_LIMIT,
  signal?: AbortSignal,
): Promise<WorkspaceTreeSnapshot> {
  const entries: WorkspaceEntry[] = [];
  const limit = Math.max(0, Math.floor(maxEntries));
  for await (const entry of iterateWorkspaceTree(workspaceDir, maxDepth, {
    signal,
  })) {
    if (entries.length >= limit) return { entries, truncated: true };
    entries.push(entry);
  }
  return { entries, truncated: false };
}

export function listCompleteWorkspaceTreeAsync(
  workspaceDir: string,
  maxDepth: number,
): Promise<WorkspaceTreeSnapshot> {
  return listWorkspaceTreeAsync(
    workspaceDir,
    maxDepth,
    Number.POSITIVE_INFINITY,
  );
}

/** Ordered, cooperative traversal that can stop before examining later directories. */
export function iterateWorkspaceTree(
  workspaceDir: string,
  maxDepth: number,
  options: {
    startDir?: string;
    signal?: AbortSignal;
    requireCanonicalDirectories?: boolean;
    includeName?: (name: string) => boolean;
  } = {},
): AsyncGenerator<WorkspaceEntry> {
  const currentDir = options.startDir ?? workspaceDir;
  return walkWorkspaceTreeAsync(
    currentDir,
    workspaceRelativePath(relative(workspaceDir, currentDir)),
    0,
    maxDepth,
    { visited: 0, ...options },
  );
}

async function* walkWorkspaceTreeAsync(
  currentDir: string,
  relativeDir: string,
  depth: number,
  maxDepth: number,
  state: {
    visited: number;
    signal?: AbortSignal;
    requireCanonicalDirectories?: boolean;
    includeName?: (name: string) => boolean;
  },
): AsyncGenerator<WorkspaceEntry> {
  const { signal } = state;
  signal?.throwIfAborted();
  if (depth > maxDepth) return;
  if (
    state.requireCanonicalDirectories &&
    (await realpath(currentDir)) !== currentDir
  )
    return;

  const dirEntries = (await readdir(currentDir, { withFileTypes: true })).sort(
    compareEntries,
  );
  signal?.throwIfAborted();
  for (const dirEntry of dirEntries) {
    if (++state.visited % 256 === 0) {
      await setImmediate(undefined, { signal });
    }
    signal?.throwIfAborted();
    if (state.includeName && !state.includeName(dirEntry.name)) continue;
    const entry = workspaceEntry(dirEntry, relativeDir, depth);
    if (!entry) continue;
    yield entry;

    if (entry.type === "directory") {
      yield* walkWorkspaceTreeAsync(
        join(currentDir, dirEntry.name),
        entry.path,
        depth + 1,
        maxDepth,
        state,
      );
    }
  }
}

function walkWorkspaceTree(
  currentDir: string,
  relativeDir: string,
  depth: number,
  maxDepth: number,
  maxEntries: number,
  entries: WorkspaceEntry[],
): void {
  if (depth > maxDepth || entries.length >= maxEntries) return;
  const dirEntries = readdirSync(currentDir, { withFileTypes: true }).sort(
    compareEntries,
  );
  for (const dirEntry of dirEntries) {
    const entry = workspaceEntry(dirEntry, relativeDir, depth);
    if (!entry) continue;
    entries.push(entry);
    if (entries.length >= maxEntries) return;
    if (entry.type === "directory") {
      walkWorkspaceTree(
        join(currentDir, dirEntry.name),
        entry.path,
        depth + 1,
        maxDepth,
        maxEntries,
        entries,
      );
      if (entries.length >= maxEntries) return;
    }
  }
}

function compareEntries(left: Dirent, right: Dirent): number {
  return left.name.localeCompare(right.name);
}

function workspaceEntry(
  dirEntry: Dirent,
  relativeDir: string,
  depth: number,
): WorkspaceEntry | undefined {
  const directory = dirEntry.isDirectory();
  if (!directory && !dirEntry.isFile()) return;
  const name = workspaceRelativePath(dirEntry.name);
  // Do not present a POSIX name that would resolve to a different path.
  if (name.includes("/")) return;
  const path = relativeDir ? `${relativeDir}/${name}` : name;
  if (!isWorkspacePathVisible(path)) return;
  return { path, type: directory ? "directory" : "file", depth };
}
