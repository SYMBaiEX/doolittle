export interface RepositoryChange {
  path: string;
  previousPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

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

export interface RepositoryPatch {
  path?: string;
  staged: boolean;
  patch: string;
  truncated: boolean;
}

export interface RepositoryWorktree {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}

export interface CreateRepositoryWorktreeInput {
  branch: string;
  path: string;
}
