/** Serializable repository read models and mutation protocol for desktop clients. */

export interface RepositoryBranch {
  name: string;
  current: boolean;
  upstream?: string;
  head?: string;
}

export interface RepositoryRemote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}

export interface RepositoryStash {
  reference: string;
  message: string;
  branch?: string;
}

export interface RepositoryConflict {
  path: string;
  stages: string[];
}

export type RepositoryMutationRequest =
  | { type: "stage"; paths: string[] }
  | { type: "unstage"; paths: string[] }
  | { type: "stage-all" }
  | { type: "unstage-all" }
  | { type: "discard"; paths: string[] }
  | { type: "discard-untracked"; paths: string[] }
  | { type: "stage-hunk"; patch: string }
  | { type: "unstage-hunk"; patch: string }
  | { type: "discard-hunk"; patch: string }
  | { type: "commit"; message: string; amend?: boolean }
  | { type: "fetch"; remote?: string }
  | { type: "pull"; remote?: string; branch?: string }
  | { type: "push"; remote?: string; branch?: string; setUpstream?: boolean }
  | {
      type: "branch-create";
      branch: string;
      startPoint?: string;
      checkout?: boolean;
    }
  | { type: "branch-switch"; branch: string }
  | { type: "branch-delete"; branch: string; force?: boolean }
  | { type: "stash-create"; message?: string; includeUntracked?: boolean }
  | { type: "stash-apply"; reference: string }
  | { type: "stash-pop"; reference?: string }
  | { type: "stash-drop"; reference: string }
  | { type: "worktree-remove"; path: string; force?: boolean }
  | { type: "worktree-prune" }
  | { type: "remote-add"; name: string; url: string }
  | { type: "remote-remove"; name: string }
  | { type: "remote-set-url"; name: string; url: string }
  | { type: "merge-abort" }
  | { type: "rebase-abort" }
  | { type: "conflict-mark-resolved"; paths: string[] };

export interface RepositoryMutationResult {
  type: RepositoryMutationRequest["type"];
  ok: boolean;
  summary: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}
