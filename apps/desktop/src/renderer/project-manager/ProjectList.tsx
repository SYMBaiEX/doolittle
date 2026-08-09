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
    <aside className="project-manager__list" aria-label="Project list">
      <button
        type="button"
        className={`project-manager__scope ${activeScope === "all" ? "is-active" : ""}`}
        onClick={() => onSelectScope("all")}
      >
        <span>⌘</span>
        <strong>All chats</strong>
        <small>{formatCount(allChatCount)}</small>
      </button>
      <button
        type="button"
        className={`project-manager__scope ${activeScope === "unscoped" ? "is-active" : ""}`}
        onClick={() => onSelectScope("unscoped")}
      >
        <span>○</span>
        <strong>Unscoped</strong>
        <small>{formatCount(unscopedChatCount)}</small>
      </button>
      <div className="project-manager__group-label">
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
        <div className="project-manager__group-label">
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
        <p className="project-manager__empty">
          {showArchived ? "No archived projects." : "No projects yet."}
        </p>
      ) : null}
      <button
        type="button"
        className="project-manager__archive-toggle"
        onClick={onToggleArchived}
      >
        {showArchived ? "← Active projects" : `Archived (${archivedCount})`}
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
      className={`project-manager__project-row ${selected ? "is-selected" : ""} ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      <ProjectAvatar project={project} size="small" />
      <span>
        <strong>{project.name}</strong>
        <small>{formatCount(project.chatCount)}</small>
      </span>
      {project.pinned ? <b title="Pinned">⌁</b> : null}
    </button>
  );
}
