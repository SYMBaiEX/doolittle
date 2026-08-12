import { lstatSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { WorkspaceEntry } from "@/types";
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
  const state = {
    limit: Math.max(0, Math.floor(maxEntries)),
    truncated: false,
    visited: 0,
  };

  await walkWorkspaceTreeAsync(
    workspaceDir,
    workspaceDir,
    0,
    maxDepth,
    entries,
    state,
  );
  return { entries, truncated: state.truncated };
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

async function walkWorkspaceTreeAsync(
  workspaceDir: string,
  currentDir: string,
  depth: number,
  maxDepth: number,
  entries: WorkspaceEntry[],
  state: { limit: number; truncated: boolean; visited: number },
): Promise<void> {
  if (depth > maxDepth || state.truncated) return;

  const dirEntries = (await readdir(currentDir, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const dirEntry of dirEntries) {
    if (state.truncated) return;

    const absolutePath = join(currentDir, dirEntry.name);
    const relativePath = workspaceRelativePath(
      relative(workspaceDir, absolutePath),
    );
    if (!isWorkspacePathVisible(relativePath) || dirEntry.isSymbolicLink()) {
      continue;
    }

    if (entries.length >= state.limit) {
      state.truncated = true;
      return;
    }

    const directory = dirEntry.isDirectory();
    entries.push({
      path: relativePath,
      type: directory ? "directory" : "file",
      depth,
    });

    state.visited += 1;
    if (state.visited % 256 === 0) {
      await yieldToRuntime();
    }

    if (directory) {
      await walkWorkspaceTreeAsync(
        workspaceDir,
        absolutePath,
        depth + 1,
        maxDepth,
        entries,
        state,
      );
    }
  }
}

function yieldToRuntime(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
