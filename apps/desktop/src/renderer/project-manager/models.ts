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

export const COLORS = [
  "#ff6a00",
  "#e77955",
  "#d49a39",
  "#95b65e",
  "#58b8a4",
  "#7f91e7",
  "#b37bd4",
  "#d76a94",
] as const;

export function defaultDraft(project?: ProjectLike): ProjectDraft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    instructions: project?.instructions ?? "",
    color: project?.color ?? COLORS[0],
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
