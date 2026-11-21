import type { RepositoryChange, RepositoryWorktree } from "./models";

function statusChange(status: string, path: string): RepositoryChange {
  const indexStatus = status[0] === "." ? " " : status[0];
  const worktreeStatus = status[1] === "." ? " " : status[1];
  const untracked = indexStatus === "?" && worktreeStatus === "?";
  return {
    path,
    indexStatus,
    worktreeStatus,
    staged: !untracked && indexStatus !== " ",
    unstaged: untracked || worktreeStatus !== " ",
    untracked,
  };
}

const ordinaryStatus = /^1 (..) (?:\S+ ){6}(.+)$/su;
const renamedStatus = /^2 (..) (?:\S+ ){7}(.+)$/su;
const unmergedStatus = /^u (..) (?:\S+ ){8}(.+)$/su;
const branchDivergence = /^# branch\.ab \+(\d+) -(\d+)$/u;

export function parseRepositoryStatus(output: string): {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  changes: RepositoryChange[];
} {
  let branch: string | undefined;
  let upstream: string | undefined;
  let divergence: RegExpExecArray | null = null;
  const records = output.split("\0");
  const changes: RepositoryChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.startsWith("# branch.head ")) {
      const name = record.slice("# branch.head ".length);
      if (name !== "(detached)") branch = name;
    } else if (record.startsWith("# branch.upstream ")) {
      upstream = record.slice("# branch.upstream ".length);
    } else if (record.startsWith("# branch.ab ")) {
      divergence = branchDivergence.exec(record);
    } else if (record.startsWith("? ")) {
      changes.push(statusChange("??", record.slice(2)));
    } else {
      const match =
        ordinaryStatus.exec(record) ??
        renamedStatus.exec(record) ??
        unmergedStatus.exec(record);
      if (!match) continue;
      const change = statusChange(match[1], match[2]);
      if (record.startsWith("2 ")) {
        // A rename/copy's source is a separate NUL-terminated field. Treat
        // it as a path even when its characters resemble a status header.
        change.previousPath = records[++index] || undefined;
      }
      changes.push(change);
    }
  }
  return {
    branch,
    // A configured upstream with no divergence record is missing locally.
    upstream: divergence ? upstream : undefined,
    ahead: Number(divergence?.[1] ?? 0),
    behind: Number(divergence?.[2] ?? 0),
    changes,
  };
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
