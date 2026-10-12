export interface ExecutionWorkspaceWitness {
  sessionId: string;
  workspacePath: string;
  projectId?: string;
}

export interface ForegroundParentWitness extends ExecutionWorkspaceWitness {
  leaseId: string;
}

export function sameExecutionWorkspace(
  left: ExecutionWorkspaceWitness | null,
  right: ExecutionWorkspaceWitness | null,
): boolean {
  return (
    !!left &&
    !!right &&
    left.sessionId === right.sessionId &&
    left.workspacePath === right.workspacePath &&
    left.projectId === right.projectId
  );
}

/** A run-shaped string cannot stand in for an accepted, still-live parent. */
export function matchesAutomaticAcpParent(
  parentRunId: unknown,
  scope: ExecutionWorkspaceWitness | null,
  botId: string,
  parents: ReadonlyMap<string, ForegroundParentWitness>,
  getRun: (runId: string) => {
    botId: string;
    sessionId: string;
    projectId?: string;
  } | null,
): boolean {
  if (typeof parentRunId !== "string" || !scope) return false;
  const parent = parents.get(parentRunId);
  const run = getRun(parentRunId);
  return (
    !!parent &&
    !!run &&
    run.botId === botId &&
    run.sessionId === scope.sessionId &&
    run.projectId === scope.projectId &&
    sameExecutionWorkspace(parent, scope)
  );
}
