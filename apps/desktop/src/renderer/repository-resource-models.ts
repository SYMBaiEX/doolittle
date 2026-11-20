import type { RepositoryControlChange } from "./repository-control";
import { asArray, asRecord, asString } from "./value-guards";

export interface WorkspaceReadResponse {
  path?: string;
  content?: string;
}

export interface RepositoryChange {
  path: string;
  previousPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface RepositoryChangesResponse {
  changes?: unknown[];
}

export interface RepositoryPatchResponse {
  patch?: {
    path?: string;
    staged?: boolean;
    patch?: string;
    truncated?: boolean;
  };
}

export interface RepositoryBranchesResponse {
  branches?: unknown[];
}

export interface RepositoryRemotesResponse {
  remotes?: unknown[];
}

export interface RepositoryStashesResponse {
  stashes?: unknown[];
}

export interface RepositoryConflictsResponse {
  conflicts?: unknown[];
}

export interface RepositoryWorktreesResponse {
  worktrees?: unknown[];
}

export function toChanges(
  value: RepositoryChangesResponse | null,
): RepositoryChange[] {
  return asArray(value?.changes)
    .map((item): RepositoryChange | null => {
      const record = asRecord(item);
      const path = asString(record.path);
      if (!path) return null;
      return {
        path,
        previousPath: asString(record.previousPath) || undefined,
        indexStatus: asString(record.indexStatus, " "),
        worktreeStatus: asString(record.worktreeStatus, " "),
        staged: Boolean(record.staged),
        unstaged: Boolean(record.unstaged),
        untracked: Boolean(record.untracked),
      };
    })
    .filter((item): item is RepositoryChange => item !== null);
}

export function controlChanges(
  changes: readonly RepositoryChange[],
): RepositoryControlChange[] {
  return changes.map((change) => ({
    path: change.path,
    status: `${change.indexStatus}${change.worktreeStatus}`.trim(),
    staged: change.staged,
    unstaged: change.unstaged,
    untracked: change.untracked,
  }));
}

export function records<T>(value: unknown[] | undefined): T[] {
  return asArray(value) as T[];
}
