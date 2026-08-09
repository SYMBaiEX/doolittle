import {
  formatCount,
  type ProjectLike,
  type ProjectResourceLike,
  resourceLabel,
  samePath,
} from "./models";
import { ProjectAvatar } from "./ProjectAvatar";

export function ProjectDetail({
  project,
  currentChatId,
  currentChatProjectId,
  onEdit,
  onArchive,
  onPin,
  onAddFiles,
  onAddFolders,
  onRemoveResource,
  onSetPrimaryPath,
  onMoveCurrentChat,
  onUnscopeCurrentChat,
  working,
}: {
  project: ProjectLike;
  currentChatId?: string | null;
  currentChatProjectId?: string | null;
  onEdit: () => void;
  onArchive: () => void;
  onPin: () => void;
  onAddFiles: () => void;
  onAddFolders: () => void;
  onRemoveResource: (resource: ProjectResourceLike) => void;
  onSetPrimaryPath: (path: string) => void;
  onMoveCurrentChat: () => void;
  onUnscopeCurrentChat: () => void;
  working: boolean;
}) {
  const resources = project.resources ?? [];
  const folderResources = resources.filter(
    (resource) => resource.kind === "folder",
  );
  const hasPrimaryResource = folderResources.some((resource) =>
    samePath(resource.path, project.primaryPath),
  );
  return (
    <>
      <div className="project-manager__project-head">
        <ProjectAvatar project={project} />
        <div>
          <div className="project-manager__title-line">
            <h3>{project.name}</h3>
            {project.pinned ? (
              <span className="project-manager__pin">Pinned</span>
            ) : null}
          </div>
          <p>{project.description || "A focused home for this work."}</p>
          <span>
            {formatCount(project.chatCount)} · {resources.length}{" "}
            {resources.length === 1 ? "source" : "sources"}
            {project.primaryPath
              ? ` · ${
                  project.primaryPath.split(/[\\/]/u).filter(Boolean).at(-1) ??
                  project.primaryPath
                }`
              : ""}
          </span>
        </div>
        <div className="project-manager__head-actions">
          <button
            type="button"
            className="button button--quiet"
            onClick={onEdit}
            disabled={working}
          >
            Edit
          </button>
          <button
            type="button"
            className="button button--quiet"
            onClick={onPin}
            disabled={working}
          >
            {project.pinned ? "Unpin" : "Pin"}
          </button>
        </div>
      </div>
      {currentChatId ? (
        <div className="project-manager__chat-action">
          <div>
            <strong>
              {currentChatProjectId === project.id
                ? "This chat belongs here"
                : "Put this chat in this project"}
            </strong>
            <small>
              {currentChatProjectId === project.id
                ? "New messages will retain this project context."
                : "Move the active conversation without changing its history."}
            </small>
          </div>
          {currentChatProjectId === project.id ? (
            <button
              type="button"
              className="button button--quiet"
              onClick={onUnscopeCurrentChat}
              disabled={working}
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              className="button button--primary"
              onClick={onMoveCurrentChat}
              disabled={working}
            >
              Move chat
            </button>
          )}
        </div>
      ) : null}
      <section className="project-manager__section">
        <div className="project-manager__section-head">
          <div>
            <span className="eyebrow">Project instructions</span>
            <h4>Working context</h4>
          </div>
          <button
            type="button"
            className="button button--quiet"
            onClick={onEdit}
            disabled={working}
          >
            Edit
          </button>
        </div>
        <p
          className={`project-manager__instructions ${project.instructions ? "" : "is-empty"}`}
        >
          {project.instructions ||
            "Add instructions that should carry across every chat in this project."}
        </p>
      </section>
      <section className="project-manager__section">
        <div className="project-manager__section-head">
          <div>
            <span className="eyebrow">Knowledge</span>
            <h4>Files & folders</h4>
          </div>
          <div className="project-manager__source-actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={onAddFiles}
              disabled={working}
            >
              + File
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={onAddFolders}
              disabled={working}
            >
              + Folder
            </button>
          </div>
        </div>
        {project.primaryPath && !hasPrimaryResource ? (
          <div className="project-manager__primary-folder">
            <span aria-hidden="true">▱</span>
            <span title={project.primaryPath}>
              <strong>
                {resourceLabel({
                  id: "primary",
                  kind: "folder",
                  path: project.primaryPath,
                })}
              </strong>
              <small>{project.primaryPath}</small>
            </span>
            <b>Primary</b>
          </div>
        ) : null}
        {resources.length ? (
          <ul className="project-manager__resources">
            {resources.map((resource) => (
              <li key={resource.id}>
                <span
                  className={`project-manager__resource-kind project-manager__resource-kind--${resource.kind}`}
                  aria-hidden="true"
                >
                  {resource.kind === "folder" ? "□" : "◇"}
                </span>
                <span title={resource.path}>
                  <strong>{resourceLabel(resource)}</strong>
                  <small>{resource.path}</small>
                </span>
                {resource.kind === "folder" ? (
                  samePath(resource.path, project.primaryPath) ? (
                    <b className="project-manager__primary-badge">Primary</b>
                  ) : (
                    <button
                      className="project-manager__make-primary"
                      disabled={working}
                      onClick={() => onSetPrimaryPath(resource.path)}
                      title={`Use ${resourceLabel(resource)} for new chats and Git operations`}
                      type="button"
                    >
                      Make primary
                    </button>
                  )
                ) : null}
                <button
                  type="button"
                  className="project-manager__remove-resource"
                  aria-label={`Remove ${resourceLabel(resource)}`}
                  onClick={() => onRemoveResource(resource)}
                  disabled={working}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="project-manager__source-empty">
            Add the repository, a folder, or reference files to ground this
            project.
          </div>
        )}
      </section>
      <footer className="project-manager__danger">
        <span>
          {project.archived
            ? "This project is archived and hidden from new chat selection."
            : "Archive a project to keep its chats and sources without clutter."}
        </span>
        <button
          type="button"
          className="button button--quiet"
          onClick={onArchive}
          disabled={working}
        >
          {project.archived ? "Restore project" : "Archive project"}
        </button>
      </footer>
    </>
  );
}

export function EmptyDetail({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="project-manager__empty-detail">
      <span aria-hidden="true">◇</span>
      <h3>Make space for the work</h3>
      <p>
        Projects keep your conversations, instructions, and local context
        together without losing the global chat history.
      </p>
      {onCreate ? (
        <button
          type="button"
          className="button button--primary"
          onClick={onCreate}
        >
          Create your first project
        </button>
      ) : null}
    </div>
  );
}
