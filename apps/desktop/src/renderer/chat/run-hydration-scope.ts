import type { BackendState } from "../../shared/contracts";

export type RunHydrationStatus = "checking" | "ready" | "unavailable";

/** Shared inventory scope, not the selected pane's bot or session. */
export interface RunHydrationScope {
  backend: BackendState;
  workspacePath: string;
  botIds: string;
  defaultBotId: string;
  sessionOwners: string;
  retry: number;
}

export interface RunHydrationSnapshot {
  scope: RunHydrationScope | null;
  status: RunHydrationStatus;
  failedBotIds?: readonly string[];
}

export function sameRunHydrationScope(
  left: RunHydrationScope | null,
  right: RunHydrationScope,
): boolean {
  return Boolean(
    left &&
      left.backend === right.backend &&
      left.workspacePath === right.workspacePath &&
      left.botIds === right.botIds &&
      left.defaultBotId === right.defaultBotId &&
      left.sessionOwners === right.sessionOwners &&
      left.retry === right.retry,
  );
}

/** Fail closed during render, before a new recovery effect can begin. */
export function effectiveRunHydration(
  snapshot: RunHydrationSnapshot,
  current: RunHydrationScope,
  selectedBotId?: string,
): RunHydrationStatus {
  if (
    current.backend.phase !== "ready" ||
    !sameRunHydrationScope(snapshot.scope, current)
  )
    return "checking";
  if (
    snapshot.status === "ready" &&
    selectedBotId &&
    snapshot.failedBotIds?.includes(selectedBotId)
  )
    return "unavailable";
  return snapshot.status;
}
