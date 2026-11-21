import { lstatSync, readdirSync } from "node:fs";
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
): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  walkWorkspaceTree(workspaceDir, workspaceDir, 0, maxDepth, entries);
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
): Promise<WorkspaceTreeSnapshot> {
  const entries: WorkspaceEntry[] = [];
  const limit = Math.max(0, Math.floor(maxEntries));
  for await (const entry of iterateWorkspaceTree(workspaceDir, maxDepth)) {
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
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const dirEntry of dirEntries) {
    if (++state.visited % 256 === 0) {
      await setImmediate(undefined, { signal });
    }
    signal?.throwIfAborted();
    const directory = dirEntry.isDirectory();
    if (!directory && !dirEntry.isFile()) continue;
    const name = workspaceRelativePath(dirEntry.name);
    // A literal backslash on POSIX would otherwise be rendered as a path
    // separator and resolve to a different entry on the operator surface.
    if (name.includes("/")) continue;
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    if (!isWorkspacePathVisible(relativePath)) continue;

    yield {
      path: relativePath,
      type: directory ? "directory" : "file",
      depth,
    };

    if (directory) {
      yield* walkWorkspaceTreeAsync(
        join(currentDir, dirEntry.name),
        relativePath,
        depth + 1,
        maxDepth,
        state,
      );
    }
  }
}

function walkWorkspaceTree(
  workspaceDir: string,
  currentDir: string,
  depth: number,
  maxDepth: number,
  entries: WorkspaceEntry[],
): void {
  if (depth > maxDepth) {
    return;
  }

  const dirEntries = readdirSync(currentDir).sort((left, right) =>
    left.localeCompare(right),
  );
  for (const name of dirEntries) {
    const absolutePath = join(currentDir, name);
    const relativePath = workspaceRelativePath(
      relative(workspaceDir, absolutePath),
    );
    if (!isWorkspacePathVisible(relativePath)) {
      continue;
    }

    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      continue;
    }

    if (stat.isDirectory()) {
      entries.push({
        path: relativePath,
        type: "directory",
        depth,
      });
      walkWorkspaceTree(
        workspaceDir,
        absolutePath,
        depth + 1,
        maxDepth,
        entries,
      );
      continue;
    }

    entries.push({
      path: relativePath,
      type: "file",
      depth,
    });
  }
}
