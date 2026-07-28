import type { SessionSummary } from "../../shared/contracts";
import type { ProjectLike } from "./ProjectManager";

export interface ProjectConversationGroup {
  project: ProjectLike;
  sessions: SessionSummary[];
  chatCount: number;
  latestActivity: string;
}

export interface ProjectSidebarModel {
  projects: ProjectConversationGroup[];
  unscopedSessions: SessionSummary[];
  unscopedChatCount: number;
}

function sessionActivity(session: SessionSummary): string {
  return session.endedAt ?? session.startedAt ?? "";
}

export function conversationLabel(session: SessionSummary): string {
  const value =
    session.title?.trim() || session.preview[0]?.trim() || "New conversation";
  return (
    value.replace(/^\[(?:user|assistant|system)\]\s*/iu, "").trim() ||
    "New conversation"
  );
}

export function sortSessionsByActivity(
  sessions: readonly SessionSummary[],
  pinnedSessionIds: ReadonlySet<string> = new Set(),
): SessionSummary[] {
  return [...sessions].sort((left, right) => {
    const leftPinned = pinnedSessionIds.has(left.sessionId);
    const rightPinned = pinnedSessionIds.has(right.sessionId);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    return sessionActivity(right).localeCompare(sessionActivity(left));
  });
}

export function repositoryLabel(path: string | undefined): string {
  if (!path) return "Repository";
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

export function buildProjectSidebarModel(
  projects: readonly ProjectLike[],
  sessions: readonly SessionSummary[],
  sessionLimit = 4,
  pinnedSessionIds: ReadonlySet<string> = new Set(),
): ProjectSidebarModel {
  const activeProjects = projects
    .filter((project) => !project.archived)
    .map<ProjectConversationGroup>((project) => {
      const projectSessions = sortSessionsByActivity(
        sessions.filter((session) => session.projectId === project.id),
        pinnedSessionIds,
      );
      return {
        project,
        sessions: projectSessions.slice(0, sessionLimit),
        chatCount: projectSessions.length,
        latestActivity: projectSessions.at(0)
          ? sessionActivity(projectSessions[0] as SessionSummary)
          : (project.updatedAt ?? ""),
      };
    })
    .sort((left, right) => {
      if (Boolean(left.project.pinned) !== Boolean(right.project.pinned)) {
        return left.project.pinned ? -1 : 1;
      }
      const activity = right.latestActivity.localeCompare(left.latestActivity);
      if (activity !== 0) return activity;
      return left.project.name.localeCompare(right.project.name);
    });

  const unscoped = sortSessionsByActivity(
    sessions.filter((session) => !session.projectId),
    pinnedSessionIds,
  );

  return {
    projects: activeProjects,
    unscopedSessions: unscoped.slice(0, sessionLimit),
    unscopedChatCount: unscoped.length,
  };
}
