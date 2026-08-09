export interface WorkspaceReadResponse {
  path?: string;
  content?: string;
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
