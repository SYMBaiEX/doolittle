import { asArray, asRecord, asString } from "../lib";
import type { WorkspaceTreeEntry } from "../workspace-file-tree";

export type {
  RepositoryBranchesResponse,
  RepositoryConflictsResponse,
  RepositoryRemotesResponse,
  RepositoryStashesResponse,
  RepositoryWorktreesResponse,
  WorkspaceReadResponse,
} from "../repository-resource-models";

export interface RepositorySummary {
  isRepository: boolean;
  root?: string;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
}

export interface RepositorySummaryResponse {
  summary?: RepositorySummary;
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
  changes?: RepositoryChange[];
}

export interface RepositoryPatchResponse {
  patch?: {
    path?: string;
    staged?: boolean;
    patch?: string;
    truncated?: boolean;
  };
}

export interface WorkspaceTreeResponse {
  entries?: WorkspaceTreeEntry[];
}

export interface WorkspaceSearchResponse {
  results?: unknown[];
}

export interface RepositoryLogResponse {
  log?: unknown;
}

export type LeftPane = "files" | "changes" | "search";
export type EditorPane = "file" | "diff";
export type UtilityPane =
  | "terminal"
  | "commits"
  | "source-control"
  | "worktrees";

export type ActionNotice = {
  tone: "neutral" | "good" | "warn" | "bad";
  message: string;
};

export interface SearchResult {
  path: string;
  matches: string[];
}

export interface CommitRow {
  id: string;
  hash: string;
  subject: string;
}

export interface DiffLine {
  key: string;
  text: string;
  tone: "addition" | "removal" | "header" | "context";
}

export const EMPTY_SUMMARY: RepositorySummary = {
  isRepository: false,
  ahead: 0,
  behind: 0,
  dirty: false,
  changedFiles: 0,
};

export function fileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function boundedContext(value: string, limit = 12_000): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[…context truncated by Doolittle…]`;
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

export function controlChanges(changes: readonly RepositoryChange[]): Array<{
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}> {
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

export function toSearchResult(value: unknown): SearchResult | null {
  const record = asRecord(value);
  const path = asString(record.path);
  if (!path) return null;
  return {
    path,
    matches: asArray(record.matches)
      .map((match) => asString(match))
      .filter(Boolean)
      .slice(0, 3),
  };
}

export function commitRows(value: unknown): CommitRow[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line, index) => {
        const [hash = "", ...subject] = line.trim().split(/\s+/u);
        return {
          id: `${hash}:${index}`,
          hash,
          subject: subject.join(" ") || "Commit",
        };
      });
  }
  return asArray(value).map((entry, index) => {
    const record = asRecord(entry);
    const hash =
      asString(record.hash) ||
      asString(record.sha) ||
      asString(record.id, `commit-${index + 1}`);
    return {
      id: `${hash}:${index}`,
      hash,
      subject:
        asString(record.subject) ||
        asString(record.message) ||
        asString(record.title, "Commit"),
    };
  });
}

export function statusLabel(change: RepositoryChange): string {
  if (change.untracked) return "U";
  return `${change.indexStatus.trim()}${change.worktreeStatus.trim()}` || "M";
}

export function patchLines(patch: string): DiffLine[] {
  const occurrences = new Map<string, number>();
  return patch.split(/\r?\n/u).map((text) => {
    const tone =
      text.startsWith("@@") ||
      text.startsWith("diff ") ||
      text.startsWith("index ") ||
      text.startsWith("--- ") ||
      text.startsWith("+++ ")
        ? "header"
        : text.startsWith("+")
          ? "addition"
          : text.startsWith("-")
            ? "removal"
            : "context";
    const signature = `${tone}:${text}`;
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    return {
      key: `${signature}:${occurrence}`,
      text,
      tone,
    };
  });
}
