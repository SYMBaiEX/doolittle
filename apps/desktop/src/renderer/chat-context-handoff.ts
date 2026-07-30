import type { ProjectScope } from "./components/ProjectManager";

export interface ChatContextRequest {
  text: string;
  workspacePath: string;
  projectScope: ProjectScope;
}

export interface ChatContextHandoff extends ChatContextRequest {
  id: string;
  sessionId: string;
}

export interface ChatContextProject {
  id: string;
  primaryPath?: string | null;
  archivedAt?: string | null;
  resources: ReadonlyArray<{
    kind: string;
    value: string;
  }>;
}

/**
 * Returns the one project allowed to receive source context. A broad "all"
 * scope must resolve from the workspace rather than inheriting the selected
 * conversation's project.
 */
export function resolveChatContextProjectScope(
  request: ChatContextRequest,
  projects: readonly ChatContextProject[],
  pathsEqual: (left: string | undefined, right: string) => boolean,
): ProjectScope | null {
  if (request.projectScope === "unscoped") return "unscoped";

  if (
    request.projectScope !== "all" &&
    projects.some(
      (project) => project.id === request.projectScope && !project.archivedAt,
    )
  ) {
    return request.projectScope;
  }

  if (!request.workspacePath) return null;
  const matchingProject = projects.find(
    (project) =>
      !project.archivedAt &&
      (pathsEqual(project.primaryPath ?? undefined, request.workspacePath) ||
        project.resources.some(
          (resource) =>
            resource.kind === "folder" &&
            pathsEqual(resource.value, request.workspacePath),
        )),
  );
  return matchingProject?.id ?? null;
}
