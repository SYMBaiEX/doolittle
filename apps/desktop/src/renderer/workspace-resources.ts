import type { ComputerOrigin } from "./computer-origin";
import { desktopQueryClient, useApiResource } from "./lib";
import type {
  RepositoryBranchesResponse,
  RepositoryChangesResponse,
  RepositoryConflictsResponse,
  RepositoryPatchResponse,
  RepositoryRemotesResponse,
  RepositoryStashesResponse,
  RepositoryWorktreesResponse,
} from "./repository-resource-models";
import { type DesktopPlatform, workspacePathsEqual } from "./workspace-path";

export function workspaceResourceOrigin(
  origin: ComputerOrigin | undefined,
  workspacePath: string | undefined,
  platform: DesktopPlatform,
): ComputerOrigin | undefined {
  return workspacePath &&
    origin &&
    workspacePathsEqual(origin.workspacePath, workspacePath, platform)
    ? origin
    : undefined;
}

type WorkspaceResourcePath = `/repo/${string}` | `/workspace/${string}`;

function workspaceResourceScope(origin: ComputerOrigin): string {
  return JSON.stringify([
    origin.botId,
    origin.originConversationId,
    origin.workspacePath,
  ]);
}

/** Share workspace reads only when the native request uses the same origin. */
export function useWorkspaceResource<T>(
  path: WorkspaceResourcePath | null,
  origin?: ComputerOrigin,
) {
  return useApiResource<T>(
    origin ? path : null,
    [],
    origin?.botId,
    origin,
    path && origin
      ? { workspaceResourceScope: workspaceResourceScope(origin) }
      : undefined,
  );
}

export function useRepositoryResources({
  origin,
  changes,
  sourceControl,
  worktrees,
}: {
  origin?: ComputerOrigin;
  changes: boolean;
  sourceControl: boolean;
  worktrees: boolean;
}) {
  return {
    changes: useWorkspaceResource<RepositoryChangesResponse>(
      changes ? "/repo/changes" : null,
      origin,
    ),
    branches: useWorkspaceResource<RepositoryBranchesResponse>(
      sourceControl ? "/repo/branches" : null,
      origin,
    ),
    remotes: useWorkspaceResource<RepositoryRemotesResponse>(
      sourceControl ? "/repo/remotes" : null,
      origin,
    ),
    stashes: useWorkspaceResource<RepositoryStashesResponse>(
      sourceControl ? "/repo/stashes" : null,
      origin,
    ),
    conflicts: useWorkspaceResource<RepositoryConflictsResponse>(
      sourceControl ? "/repo/conflicts" : null,
      origin,
    ),
    worktrees: useWorkspaceResource<RepositoryWorktreesResponse>(
      worktrees ? "/repo/worktrees" : null,
      origin,
    ),
  };
}

export function useRepositoryPatch(
  path: string | undefined,
  staged: boolean,
  origin?: ComputerOrigin,
) {
  return useWorkspaceResource<RepositoryPatchResponse>(
    path
      ? `/repo/patch?path=${encodeURIComponent(path)}&staged=${staged}`
      : null,
    origin,
  );
}

/** Refetch mounted reads and mark hidden or unmounted views stale. */
export async function refreshWorkspaceResources(origin?: ComputerOrigin) {
  if (!origin) return;
  const scope = workspaceResourceScope(origin);
  await desktopQueryClient.invalidateQueries({
    predicate: (query) => query.meta?.workspaceResourceScope === scope,
  });
}

export function workspaceMutationRequest<T extends object>(
  request: T,
  origin?: ComputerOrigin,
): T & ComputerOrigin {
  if (
    !origin?.botId ||
    !origin.originConversationId ||
    !origin.workspacePath.trim()
  ) {
    throw new Error("A confirmed conversation workspace is required.");
  }
  return { ...request, ...origin };
}
