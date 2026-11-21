import type { ComputerOrigin } from "./computer-origin";
import { apiResourceCacheKey, desktopQueryClient, useApiResource } from "./lib";
import type {
  RepositoryBranchesResponse,
  RepositoryChangesResponse,
  RepositoryConflictsResponse,
  RepositoryPatchResponse,
  RepositoryRemotesResponse,
  RepositoryStashesResponse,
  RepositoryWorktreesResponse,
  WorkspaceReadResponse,
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
  enabled = true,
) {
  return useApiResource<T>(
    origin ? path : null,
    [],
    origin?.botId,
    origin,
    path && origin
      ? { workspaceResourceScope: workspaceResourceScope(origin) }
      : undefined,
    enabled,
  );
}

export function useRepositoryResources({
  origin,
  changes,
  sourceControl,
  worktrees,
  enabled = true,
}: {
  origin?: ComputerOrigin;
  changes: boolean;
  sourceControl: boolean;
  worktrees: boolean;
  enabled?: boolean;
}) {
  return {
    changes: useWorkspaceResource<RepositoryChangesResponse>(
      changes ? "/repo/changes" : null,
      origin,
      enabled,
    ),
    branches: useWorkspaceResource<RepositoryBranchesResponse>(
      sourceControl ? "/repo/branches" : null,
      origin,
      enabled,
    ),
    remotes: useWorkspaceResource<RepositoryRemotesResponse>(
      sourceControl ? "/repo/remotes" : null,
      origin,
      enabled,
    ),
    stashes: useWorkspaceResource<RepositoryStashesResponse>(
      sourceControl ? "/repo/stashes" : null,
      origin,
      enabled,
    ),
    conflicts: useWorkspaceResource<RepositoryConflictsResponse>(
      sourceControl ? "/repo/conflicts" : null,
      origin,
      enabled,
    ),
    worktrees: useWorkspaceResource<RepositoryWorktreesResponse>(
      worktrees ? "/repo/worktrees" : null,
      origin,
      enabled,
    ),
  };
}

export function useRepositoryPatch(
  path: string | undefined,
  staged: boolean,
  origin?: ComputerOrigin,
  enabled = true,
) {
  return useWorkspaceResource<RepositoryPatchResponse>(
    path
      ? `/repo/patch?path=${encodeURIComponent(path)}&staged=${staged}`
      : null,
    origin,
    enabled,
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

/** Publish an acknowledged native write before the next authoritative read. */
export async function publishWorkspaceFileSave(
  origin: ComputerOrigin,
  path: string,
  content: string,
) {
  const key = apiResourceCacheKey(
    `/workspace/read?path=${encodeURIComponent(path)}`,
    [],
    origin.botId,
    origin,
  );
  const queryKey = [key];
  // An older read can finish while the native approval and write are pending.
  await desktopQueryClient.cancelQueries({ queryKey, exact: true });
  desktopQueryClient.setQueryData<WorkspaceReadResponse>(queryKey, {
    path,
    content,
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
