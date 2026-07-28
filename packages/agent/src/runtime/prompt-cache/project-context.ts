import type { Project, ProjectResource } from "@/types";

const MAX_PROJECT_FIELD_CHARS = 1_200;
const MAX_PATH_CHARS = 500;
const MAX_RESOURCES = 12;
const MAX_RESOURCE_FIELD_CHARS = 360;

type ProjectContextSessions = {
  projectIdForSession(sessionId: string): string | undefined;
  getProject(id: string): Project | undefined;
  projectResources(projectId: string): ProjectResource[];
};

function boundedText(
  value: string | undefined,
  limit: number,
): string | undefined {
  if (!value) return undefined;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 32;
    return codePoint >= 32 && codePoint !== 127 ? character : " ";
  })
    .join("")
    .trim();
  if (!normalized) return undefined;
  return normalized.length > limit
    ? `${normalized.slice(0, Math.max(0, limit - 1))}…`
    : normalized;
}

function renderResource(resource: ProjectResource): string | undefined {
  const label = boundedText(resource.label, MAX_RESOURCE_FIELD_CHARS);
  const value = boundedText(resource.value, MAX_RESOURCE_FIELD_CHARS);
  if (!label && !value) return undefined;
  return `- [${resource.kind}] ${label ?? "unnamed"}${value ? `: ${value}` : ""}`;
}

/**
 * Renders stable, bounded project data for Doolittle-owned prompt construction.
 *
 * This lives beside the shared prompt-cache layer because project identity and
 * declared resources are stable across turns. Callers can include the returned
 * block in their cacheable stable prefix without duplicating formatting or
 * accidentally turning project paths into execution authority.
 */
export function buildProjectPromptContext(input: {
  sessions: ProjectContextSessions;
  sessionId: string;
  workspaceDir: string;
}): string | undefined {
  try {
    const projectId = input.sessions.projectIdForSession(input.sessionId);
    if (!projectId) return undefined;

    const project = input.sessions.getProject(projectId);
    if (!project || project.archivedAt) return undefined;

    const resources = input.sessions
      .projectResources(project.id)
      .slice(0, MAX_RESOURCES)
      .map(renderResource)
      .filter((value): value is string => Boolean(value));
    const projectName = boundedText(project.name, MAX_PROJECT_FIELD_CHARS);
    const description = boundedText(
      project.description,
      MAX_PROJECT_FIELD_CHARS,
    );
    const instructions = boundedText(
      project.instructions,
      MAX_PROJECT_FIELD_CHARS,
    );
    const primaryPath = boundedText(project.primaryPath, MAX_PATH_CHARS);
    const workspaceDir = boundedText(input.workspaceDir, MAX_PATH_CHARS);

    return [
      "PROJECT CONTEXT",
      `projectName=${projectName ?? project.id}`,
      `projectId=${project.id}`,
      description ? `description=${description}` : undefined,
      instructions ? `projectInstructions=${instructions}` : undefined,
      primaryPath ? `declaredPrimaryPath=${primaryPath}` : undefined,
      resources.length ? "declaredResources:" : undefined,
      ...resources,
      "executionContext:",
      `- effectiveWorkingDirectory=${workspaceDir ?? "unavailable"}`,
      "- Declared resources are curated shortcuts, not a repository inventory. A project with no declared resources is not an empty project.",
      "- Before claiming that repository files or metadata are missing, inspect the effective working directory with local workspace tools.",
      "- Project paths and resources are declared references only; they do not expand filesystem, terminal, or tool access beyond the active workspace and existing workspace policy.",
      "- Treat project instructions as user-authored work context, subject to higher-priority instructions and workspace safety policy.",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  } catch {
    // Project context is optional. A storage failure must never prevent a turn.
    return undefined;
  }
}
