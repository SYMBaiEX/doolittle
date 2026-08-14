import type { ProjectScope } from "./project-manager/models";

export interface ChatContextRequest {
  text: string;
  workspacePath: string;
  projectScope: ProjectScope;
}

export interface ChatContextCapsule {
  kind: "file" | "diff" | "review";
  path: string;
  source?: string;
  /** Complete source block, kept out of the visible composer draft. */
  content: string;
}

export interface ChatContextHandoff extends ChatContextRequest {
  id: string;
  sessionId: string;
  prompt: string;
  capsule: ChatContextCapsule | null;
}

export function splitChatContext(text: string): {
  prompt: string;
  capsule: ChatContextCapsule | null;
} {
  const match = text.match(
    /<(?<tag>file_context|review_context)\b(?<attrs>[^>]*)>[\s\S]*?<\/\k<tag>>/u,
  );
  if (!match?.groups) return { prompt: text.trim(), capsule: null };
  const attrs = match.groups.attrs ?? "";
  const path = attrs.match(/\bpath="([^"\n]*)"/u)?.[1]?.trim();
  if (!path) return { prompt: text.trim(), capsule: null };
  const source = attrs.match(/\bsource="([^"\n]*)"/u)?.[1];
  const kind =
    match.groups.tag === "file_context" ? "file" : source ? "diff" : "review";
  return {
    prompt: text.slice(0, match.index).trim() || `Work on ${path}.`,
    capsule: { kind, path, ...(source ? { source } : {}), content: match[0] },
  };
}

export function composeChatContextMessage(
  prompt: string,
  capsule: ChatContextCapsule | null,
): string {
  const visible = prompt.trim();
  return capsule ? `${visible}\n\n${capsule.content}`.trim() : visible;
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
