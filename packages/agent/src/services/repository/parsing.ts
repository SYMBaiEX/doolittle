import type { RepositoryChange, RepositoryWorktree } from "./models";

function parseStatusRecord(record: string): RepositoryChange | null {
  if (record.length < 4) return null;
  const indexStatus = record[0] ?? " ";
  const worktreeStatus = record[1] ?? " ";
  const rawPath = record.slice(3);
  if (!rawPath) return null;
  const untracked = indexStatus === "?" && worktreeStatus === "?";
  return {
    path: rawPath,
    indexStatus,
    worktreeStatus,
    staged: !untracked && indexStatus !== " ",
    unstaged: untracked || worktreeStatus !== " ",
    untracked,
  };
}

export function parseStatusOutput(output: string): RepositoryChange[] {
  const records = output.split("\0").filter(Boolean);
  const changes: RepositoryChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const change = parseStatusRecord(records[index] ?? "");
    if (!change) continue;
    const renamed =
      ["R", "C"].includes(change.indexStatus) ||
      ["R", "C"].includes(change.worktreeStatus);
    if (renamed && records[index + 1]) {
      change.previousPath = records[index + 1];
      index += 1;
    }
    changes.push(change);
  }
  return changes;
}

export function parseWorktrees(output: string): RepositoryWorktree[] {
  if (!output.trim()) return [];
  return output
    .split(/\n\s*\n/u)
    .map((block): RepositoryWorktree | null => {
      const fields = new Map<string, string>();
      const flags = new Set<string>();
      for (const line of block.split("\n")) {
        const [key, ...rest] = line.trim().split(" ");
        if (!key) continue;
        if (key === "bare" || key === "detached" || key === "prunable") {
          flags.add(key);
        } else if (rest.length) {
          fields.set(key, rest.join(" "));
        }
      }
      const path = fields.get("worktree");
      if (!path) return null;
      const branchRef = fields.get("branch");
      const worktree: RepositoryWorktree = {
        path,
        detached: flags.has("detached"),
        bare: flags.has("bare"),
        prunable: flags.has("prunable"),
      };
      const head = fields.get("HEAD");
      if (head) worktree.head = head;
      if (branchRef) {
        worktree.branch = branchRef.replace(/^refs\/heads\//u, "");
      }
      return worktree;
    })
    .filter((worktree): worktree is RepositoryWorktree => worktree !== null);
}
