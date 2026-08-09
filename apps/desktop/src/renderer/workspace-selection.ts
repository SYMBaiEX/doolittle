import type { Project, SessionSummary } from "../shared/contracts";
import type { ProjectScope } from "./project-manager/models";

export interface WorkspaceSelection {
  projectScope: ProjectScope;
  sessionId: string;
}

function sessionBelongsToScope(
  session: SessionSummary,
  scope: ProjectScope,
): boolean {
  return scope === "unscoped"
    ? !session.projectId
    : scope !== "all" && session.projectId === scope;
}

function latestSessionForScope(
  sessions: readonly SessionSummary[],
  scope: ProjectScope,
): SessionSummary | undefined {
  return sessions
    .filter((session) => sessionBelongsToScope(session, scope))
    .sort((left, right) =>
      (right.endedAt ?? right.startedAt ?? "").localeCompare(
        left.endedAt ?? left.startedAt ?? "",
      ),
    )[0];
}

/**
 * A workspace is a concrete target, so it must never inherit a different
 * project's conversation selection. Resolve all three pieces of desktop
 * context from that one path before committing it in App.
 */
export function resolveWorkspaceSelection({
  workspacePath,
  projects,
  sessions,
  selectedSessionId,
  createSessionId,
  pathsEqual,
}: {
  workspacePath: string;
  projects: readonly Project[];
  sessions: readonly SessionSummary[];
  selectedSessionId: string;
  createSessionId: () => string;
  pathsEqual: (left: string | undefined, right: string) => boolean;
}): WorkspaceSelection {
  const matchingProject = projects.find(
    (project) =>
      !project.archivedAt &&
      (pathsEqual(project.primaryPath, workspacePath) ||
        project.resources.some(
          (resource) =>
            resource.kind === "folder" &&
            pathsEqual(resource.value, workspacePath),
        )),
  );
  const projectScope = matchingProject?.id ?? "unscoped";
  const selectedSession = sessions.find(
    (session) => session.sessionId === selectedSessionId,
  );
  const matchingSession =
    selectedSession && sessionBelongsToScope(selectedSession, projectScope)
      ? selectedSession
      : latestSessionForScope(sessions, projectScope);

  return {
    projectScope,
    // A draft has not been persisted with a project yet. Retain its identity
    // while binding the parent App's project scope to the newly selected path.
    sessionId:
      matchingSession?.sessionId ??
      (!selectedSession ? selectedSessionId : createSessionId()),
  };
}
