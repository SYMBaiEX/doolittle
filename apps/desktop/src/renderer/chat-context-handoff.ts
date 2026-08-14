import type { ProjectScope } from "./project-manager/models";

export interface ChatContextRequest {
  text: string;
  workspacePath: string;
  projectScope: ProjectScope;
}

export const CHAT_CONTEXT_CAPSULE_KINDS = [
  "file",
  "diff",
  "review",
  "brief",
  "terminal",
  "plan",
] as const;

export type ChatContextCapsuleKind =
  (typeof CHAT_CONTEXT_CAPSULE_KINDS)[number];

export interface ChatContextCapsule {
  kind: ChatContextCapsuleKind;
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
    /(?<block><(?<tag>file_context|review_context)\b(?<attrs>[^>]*)>[\s\S]*?<\/\k<tag>>|<doolittle-context\b(?<attrs2>[^>]*)>[\s\S]*?<\/doolittle-context>|<terminal_context\b(?<attrs3>[^>]*)>[\s\S]*?<\/terminal_context>)/u,
  );
  if (!match?.groups) return { prompt: text.trim(), capsule: null };
  const attrs =
    match.groups.attrs ?? match.groups.attrs2 ?? match.groups.attrs3 ?? "";
  const blockTag = match[0].startsWith("<terminal_context")
    ? "terminal"
    : match[0].startsWith("<doolittle-context")
      ? "doolittle"
      : match.groups.tag;
  const path =
    attrs.match(/\bpath="([^"\n]*)"/u)?.[1]?.trim() ||
    attrs.match(/\bsource="([^"\n]*)"/u)?.[1]?.trim() ||
    (blockTag === "terminal" ? "Terminal" : undefined);
  if (!path) return { prompt: text.trim(), capsule: null };
  const source = attrs.match(/\bsource="([^"\n]*)"/u)?.[1];
  const rawKind = attrs.match(/\bkind="([^"\n]*)"/u)?.[1];
  const kind =
    blockTag === "file_context"
      ? "file"
      : blockTag === "review_context"
        ? source
          ? "diff"
          : "review"
        : blockTag === "terminal"
          ? "terminal"
          : CHAT_CONTEXT_CAPSULE_KINDS.includes(
                rawKind as ChatContextCapsuleKind,
              )
            ? (rawKind as ChatContextCapsuleKind)
            : "brief";
  return {
    prompt:
      `${text.slice(0, match.index)}${text.slice((match.index ?? 0) + match[0].length)}`.trim() ||
      `Work on ${path}.`,
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
