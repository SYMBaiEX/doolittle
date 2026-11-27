import { asArray, asRecord, asString } from "../lib";
import type { RepositoryChange } from "../repository-resource-models";
import type { WorkspaceTreeEntry } from "../workspace-file-tree";
import { workspacePathBaseName } from "../workspace-path";

export type {
  RepositoryBranchesResponse,
  RepositoryChange,
  RepositoryChangesResponse,
  RepositoryConflictsResponse,
  RepositoryPatchResponse,
  RepositoryRemotesResponse,
  RepositoryStashesResponse,
  RepositoryWorktreesResponse,
  WorkspaceReadResponse,
} from "../repository-resource-models";
export {
  controlChanges,
  records,
  toChanges,
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

export interface WorkspaceTreeResponse {
  entries?: WorkspaceTreeEntry[];
  truncated?: boolean;
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

export const EMPTY_SUMMARY: RepositorySummary = {
  isRepository: false,
  ahead: 0,
  behind: 0,
  dirty: false,
  changedFiles: 0,
};

export function fileName(path: string): string {
  return workspacePathBaseName(path);
}

export function boundedContext(value: string, limit = 12_000): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[…context truncated by Doolittle…]`;
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
