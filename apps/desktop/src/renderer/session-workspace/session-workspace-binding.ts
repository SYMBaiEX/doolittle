import type { SessionSummary } from "../../shared/contracts";
import type { ProjectLike } from "../project-manager/models";
import { type DesktopPlatform, workspacePathsEqual } from "../workspace-path";

export function foreignSessionProject(
  session: SessionSummary | undefined,
  projects: readonly ProjectLike[] | undefined,
  workspacePath: string,
  platform: DesktopPlatform,
): ProjectLike | undefined {
  const project = projects?.find((value) => value.id === session?.projectId);
  return project?.primaryPath &&
    !workspacePathsEqual(project.primaryPath, workspacePath, platform)
    ? project
    : undefined;
}

export function sessionWorkspaceBinding(
  session: SessionSummary | undefined,
  projects: readonly ProjectLike[] | undefined,
  workspacePath: string,
  platform: DesktopPlatform,
): {
  kind: "unbound" | "current" | "unknown" | "foreign";
  project?: ProjectLike;
} {
  if (!session?.projectId) return { kind: "unbound" };
  const project = projects?.find((value) => value.id === session.projectId);
  if (!project?.primaryPath) return { kind: "unknown", project };
  return {
    kind: workspacePathsEqual(project.primaryPath, workspacePath, platform)
      ? "current"
      : "foreign",
    project,
  };
}
