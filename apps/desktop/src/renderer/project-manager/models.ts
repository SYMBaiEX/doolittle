export type ProjectScope = "all" | "unscoped" | string;

export interface ProjectResourceLike {
  id: string;
  kind: "file" | "folder";
  path: string;
  label?: string;
  createdAt?: string;
}

export interface ProjectLike {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  primaryPath?: string;
  pinned?: boolean;
  archived?: boolean;
  chatCount?: number;
  resources?: readonly ProjectResourceLike[];
  updatedAt?: string;
}

export interface ProjectDraft {
  name: string;
  description: string;
  instructions: string;
  color: string;
}

export interface ProjectManagerProps {
  projects: readonly ProjectLike[];
  activeScope: ProjectScope;
  unscopedChatCount?: number;
  allChatCount?: number;
  currentChatId?: string | null;
  currentChatProjectId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onScopeChange: (scope: ProjectScope) => void;
  onCreateProject?: (draft: ProjectDraft) => void | Promise<void>;
  onOpenProjectManager?: () => void;
  onUpdateProject?: (
    project: ProjectLike,
    draft: ProjectDraft,
  ) => void | Promise<void>;
  onArchiveProject?: (
    project: ProjectLike,
    archived: boolean,
  ) => void | Promise<void>;
  onPinProject?: (
    project: ProjectLike,
    pinned: boolean,
  ) => void | Promise<void>;
  onAddFiles?: (project: ProjectLike) => void | Promise<void>;
  onAddFolders?: (project: ProjectLike) => void | Promise<void>;
  onRemoveResource?: (
    project: ProjectLike,
    resource: ProjectResourceLike,
  ) => void | Promise<void>;
  onSetPrimaryPath?: (
    project: ProjectLike,
    path: string,
  ) => void | Promise<void>;
  onMoveCurrentChat?: (projectId: string | null) => void | Promise<void>;
  className?: string;
}

export const THEME_PROJECT_COLOR = "theme";
export const LEGACY_DEFAULT_PROJECT_COLOR = "#ff6a00";

export const COLORS = [
  THEME_PROJECT_COLOR,
  "#e77955",
  "#d49a39",
  "#95b65e",
  "#58b8a4",
  "#7f91e7",
  "#b37bd4",
  "#d76a94",
] as const;

/**
 * Projects created before theme profiles stored Doolittle's old orange as
 * ordinary project data. Treat that one legacy default as the live theme
 * accent while preserving every explicitly different project colour.
 */
export function projectAccentColor(color?: string): string {
  const normalized = color?.trim();
  if (
    !normalized ||
    normalized === THEME_PROJECT_COLOR ||
    normalized.toLowerCase() === LEGACY_DEFAULT_PROJECT_COLOR
  ) {
    return "var(--accent)";
  }
  return normalized;
}

export function projectDraftColor(color?: string): string {
  return projectAccentColor(color) === "var(--accent)"
    ? THEME_PROJECT_COLOR
    : (color?.trim() ?? THEME_PROJECT_COLOR);
}

export function defaultDraft(project?: ProjectLike): ProjectDraft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    instructions: project?.instructions ?? "",
    color: projectDraftColor(project?.color),
  };
}

export function projectLabel(project: ProjectLike): string {
  return project.icon?.trim() || project.name.slice(0, 1).toUpperCase() || "P";
}

export function resourceLabel(resource: ProjectResourceLike): string {
  return (
    resource.label?.trim() ||
    resource.path.split(/[\\/]/u).filter(Boolean).at(-1) ||
    resource.path
  );
}

export function samePath(
  left: string | undefined,
  right: string | undefined,
  platform = typeof window === "undefined"
    ? ""
    : (window.doolittle?.platform ?? ""),
): boolean {
  if (!left || !right) return false;
  const normalizedLeft = left.replace(/[\\/]+$/u, "");
  const normalizedRight = right.replace(/[\\/]+$/u, "");
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function formatCount(count: number | undefined): string {
  if (!count) return "No chats";
  return `${count} ${count === 1 ? "chat" : "chats"}`;
}
