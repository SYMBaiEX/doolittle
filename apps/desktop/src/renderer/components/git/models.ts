import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";

export interface GitWorktree {
  path: string;
  branch?: string;
  current?: boolean;
  prunable?: boolean;
}

export type GitMutationRunner = (
  request: RepositoryMutationRequest,
) => Promise<boolean>;

export function shortGitPath(path: string): string {
  const pieces = path.split("/").filter(Boolean);
  return pieces.length > 4 ? `…/${pieces.slice(-4).join("/")}` : path;
}
