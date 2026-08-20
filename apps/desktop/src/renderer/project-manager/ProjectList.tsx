import { Archive, ArrowLeft, History, MessageCircle, Pin } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import {
  PROJECT_MANAGER_GROUP_LABEL_CLASS,
  PROJECT_MANAGER_LIST_CLASS,
  PROJECT_MANAGER_ROW_ACTIVE_CLASS,
  PROJECT_MANAGER_ROW_CLASS,
  PROJECT_MANAGER_ROW_SELECTED_CLASS,
  PROJECT_MANAGER_SCOPE_ACTIVE_CLASS,
  PROJECT_MANAGER_SCOPE_CLASS,
} from "./layout";
import { formatCount, type ProjectLike, type ProjectScope } from "./models";
import { ProjectAvatar } from "./ProjectAvatar";

export function ProjectList({
  activeScope,
  allChatCount,
  archivedCount,
  pinned,
  regular,
  selectedId,
  showArchived,
  unscopedChatCount,
  onSelectScope,
  onSelectProject,
  onToggleArchived,
}: {
  activeScope: ProjectScope;
  allChatCount?: number;
  archivedCount: number;
  pinned: readonly ProjectLike[];
  regular: readonly ProjectLike[];
  selectedId: string | null;
  showArchived: boolean;
  unscopedChatCount?: number;
  onSelectScope: (scope: ProjectScope) => void;
  onSelectProject: (project: ProjectLike) => void;
  onToggleArchived: () => void;
}) {
  const projects = [...pinned, ...regular];
  return (
    <aside className={PROJECT_MANAGER_LIST_CLASS} aria-label="Project list">
      <button
        type="button"
        className={`${PROJECT_MANAGER_SCOPE_CLASS} ${activeScope === "all" ? PROJECT_MANAGER_SCOPE_ACTIVE_CLASS : ""}`}
        onClick={() => onSelectScope("all")}
      >
        <span>
          <UiIcon icon={History} size="sm" />
        </span>
        <strong>All chats</strong>
        <small>{formatCount(allChatCount)}</small>
      </button>
      <button
        type="button"
        className={`${PROJECT_MANAGER_SCOPE_CLASS} ${activeScope === "unscoped" ? PROJECT_MANAGER_SCOPE_ACTIVE_CLASS : ""}`}
        onClick={() => onSelectScope("unscoped")}
      >
        <span>
          <UiIcon icon={MessageCircle} size="sm" />
        </span>
        <strong>Unscoped</strong>
        <small>{formatCount(unscopedChatCount)}</small>
      </button>
      <div className={PROJECT_MANAGER_GROUP_LABEL_CLASS}>
        <span>Pinned</span>
      </div>
      {pinned.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          selected={selectedId === project.id}
          active={activeScope === project.id}
          onClick={() => onSelectProject(project)}
        />
      ))}
      {regular.length ? (
        <div className={PROJECT_MANAGER_GROUP_LABEL_CLASS}>
          <span>{showArchived ? "Archived" : "Projects"}</span>
        </div>
      ) : null}
      {regular.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          selected={selectedId === project.id}
          active={activeScope === project.id}
          onClick={() => onSelectProject(project)}
        />
      ))}
      {!projects.length ? (
        <p className="project-manager__empty mx-2 my-2.5 text-xs text-[var(--muted)]">
          {showArchived ? "No archived projects." : "No projects yet."}
        </p>
      ) : null}
      <button
        type="button"
        className="project-manager__archive-toggle mt-auto inline-flex items-center gap-1.5 px-1.75 pt-3 pb-0.75 text-left text-xs text-[var(--muted)] transition-colors hover:text-[var(--text-soft)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-border)] max-[740px]:hidden"
        data-project-action="toggle-archive"
        onClick={onToggleArchived}
      >
        <UiIcon icon={showArchived ? ArrowLeft : Archive} size="xs" />
        {showArchived ? "Active projects" : `Archived (${archivedCount})`}
      </button>
    </aside>
  );
}

function ProjectRow({
  project,
  selected,
  active,
  onClick,
}: {
  project: ProjectLike;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${PROJECT_MANAGER_ROW_CLASS} ${selected ? PROJECT_MANAGER_ROW_SELECTED_CLASS : ""} ${active ? PROJECT_MANAGER_ROW_ACTIVE_CLASS : ""}`}
      onClick={onClick}
    >
      <ProjectAvatar project={project} size="small" />
      <span>
        <strong>{project.name}</strong>
        <small>{formatCount(project.chatCount)}</small>
      </span>
      {project.pinned ? (
        <b title="Pinned">
          <UiIcon className="fill-current" icon={Pin} size="xs" />
          <span className="sr-only">Pinned</span>
        </b>
      ) : null}
    </button>
  );
}
