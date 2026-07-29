import type {
  RepositoryMutationRequest,
  RepositoryMutationResult,
} from "@doolittle/contracts/repository";

export type GitNoticeTone = "neutral" | "good" | "bad";

export type GitNotice = {
  tone: GitNoticeTone;
  message: string;
};

export type GitChangeGroup = "staged" | "unstaged" | "untracked";

export type RepositoryControlChange = {
  path: string;
  status: string;
  staged: boolean;
  unstaged?: boolean;
  untracked: boolean;
};

export function groupRepositoryChanges(
  changes: readonly RepositoryControlChange[],
): Record<GitChangeGroup, RepositoryControlChange[]> {
  const groups: Record<GitChangeGroup, RepositoryControlChange[]> = {
    staged: [],
    unstaged: [],
    untracked: [],
  };
  for (const change of changes) {
    if (change.untracked) {
      groups.untracked.push(change);
      continue;
    }
    if (change.staged) groups.staged.push(change);
    if (change.unstaged || !change.staged) groups.unstaged.push(change);
  }
  return groups;
}

export function gitChangeLabel(change: RepositoryControlChange): string {
  const state = change.status.trim().toUpperCase();
  if (change.untracked || state === "??") return "Untracked";
  if (state === "A" || state === "A ") return "Added";
  if (state === "D" || state === " D") return "Deleted";
  if (state === "R" || state.startsWith("R")) return "Renamed";
  if (state === "U" || state.includes("U")) return "Conflict";
  return "Modified";
}

export function requestLabel(request: RepositoryMutationRequest): string {
  switch (request.type) {
    case "stage":
      return "Staging changes…";
    case "stage-all":
      return "Staging all changes…";
    case "unstage":
      return "Unstaging changes…";
    case "unstage-all":
      return "Unstaging all changes…";
    case "discard":
      return "Discarding changes…";
    case "discard-untracked":
      return "Discarding untracked files…";
    case "stage-hunk":
      return "Staging hunk…";
    case "unstage-hunk":
      return "Unstaging hunk…";
    case "discard-hunk":
      return "Discarding hunk…";
    case "commit":
      return request.amend ? "Amending commit…" : "Creating commit…";
    case "fetch":
      return "Fetching from remote…";
    case "pull":
      return "Pulling changes…";
    case "push":
      return "Pushing changes…";
    case "branch-create":
      return "Creating branch…";
    case "branch-switch":
      return "Switching branch…";
    case "branch-delete":
      return "Deleting branch…";
    case "stash-create":
      return "Stashing changes…";
    case "stash-apply":
    case "stash-pop":
      return "Applying stash…";
    case "stash-drop":
      return "Dropping stash…";
    case "conflict-mark-resolved":
      return "Marking conflict resolved…";
    case "merge-abort":
    case "rebase-abort":
      return "Aborting Git operation…";
    case "remote-add":
    case "remote-remove":
    case "remote-set-url":
      return "Updating remote…";
    case "worktree-remove":
    case "worktree-prune":
      return "Updating worktrees…";
  }
}

export function mutationNotice(response: RepositoryMutationResult): GitNotice {
  if (response.ok) {
    return {
      tone: "good",
      message: response.summary || "Git operation completed.",
    };
  }
  return {
    tone: "bad",
    message:
      response.error ||
      response.stderr ||
      response.summary ||
      "Git operation could not be completed.",
  };
}

export function branchNameIsValid(value: string): boolean {
  const name = value.trim();
  return Boolean(
    name &&
      name.length <= 240 &&
      !name.startsWith("-") &&
      !name.startsWith("/") &&
      !name.endsWith("/") &&
      !name.includes("..") &&
      !/[~^:?*[]/.test(name) &&
      !/\s/u.test(name) &&
      !name.includes("//"),
  );
}

export function remoteNameIsValid(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value.trim());
}

export function remoteUrlIsValid(value: string): boolean {
  const url = value.trim();
  return (
    /^(?:https?|ssh):\/\//u.test(url) || /^[^\s@/:]+@[^\s:]+:.+/u.test(url)
  );
}
