import { Button } from "@elizaos/ui/components/ui/button";
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
      <div className="project-manager__project-head flex items-start gap-3">
        <ProjectAvatar project={project} />
        <div className="min-w-0">
          <div className="project-manager__title-line flex items-center gap-2.25">
            <h3 className="m-0 font-[var(--font-display)] text-base leading-[1.1] tracking-[-0.025em]">
              {project.name}
            </h3>
            {project.pinned ? (
              <span className="project-manager__pin border-[var(--accent)] border-l-2 py-0.25 pl-1.5 text-[10px] text-[var(--muted)]">
                Pinned
              </span>
            ) : null}
          </div>
          <p className="my-1.25 text-[13px] text-[var(--text-soft)]">
            {project.description || "A focused home for this work."}
          </p>
          <span className="text-[11px] text-[var(--muted)]">
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
        <div className="project-manager__head-actions ml-auto flex gap-1.25 max-[740px]:flex-col">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onEdit}
            disabled={working}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onPin}
            disabled={working}
          >
            {project.pinned ? "Unpin" : "Pin"}
          </Button>
        </div>
      </div>
      {currentChatId ? (
        <div className="project-manager__chat-action my-5.5 flex items-center justify-between gap-4 rounded-[var(--radius-sm)] border border-[var(--border)] border-l-2 border-l-[var(--accent)] bg-[var(--surface-raised)] px-3 py-2.75 max-[740px]:items-start max-[740px]:flex-col">
          <div className="grid gap-0.75">
            <strong className="text-xs">
              {currentChatProjectId === project.id
                ? "This chat belongs here"
                : "Put this chat in this project"}
            </strong>
            <small className="text-[11px] text-[var(--text-soft)]">
              {currentChatProjectId === project.id
                ? "New messages will retain this project context."
                : "Move the active conversation without changing its history."}
            </small>
          </div>
          {currentChatProjectId === project.id ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onUnscopeCurrentChat}
              disabled={working}
            >
              Remove
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onMoveCurrentChat}
              disabled={working}
            >
              Move chat
            </Button>
          )}
        </div>
      ) : null}
      <section className="project-manager__section border-[var(--border)] border-t py-5">
        <div className="project-manager__section-head flex items-start justify-between gap-3 max-[420px]:gap-2">
          <div>
            <span className="eyebrow">Project instructions</span>
            <h4 className="mt-0.75 mb-0 font-[var(--font-display)] text-[13px] tracking-[-0.01em]">
              Working context
            </h4>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onEdit}
            disabled={working}
          >
            Edit
          </Button>
        </div>
        <p
          className={`project-manager__instructions mt-2.75 mb-0 whitespace-pre-wrap border-[var(--border-strong)] border-l py-0.5 pl-3 text-[13px] leading-[1.55] text-[var(--text-soft)] ${project.instructions ? "" : "is-empty italic text-[var(--muted)]"}`}
        >
          {project.instructions ||
            "Add instructions that should carry across every chat in this project."}
        </p>
      </section>
      <section className="project-manager__section border-[var(--border)] border-t py-5">
        <div className="project-manager__section-head flex items-start justify-between gap-3 max-[420px]:gap-2">
          <div>
            <span className="eyebrow">Knowledge</span>
            <h4 className="mt-0.75 mb-0 font-[var(--font-display)] text-[13px] tracking-[-0.01em]">
              Files & folders
            </h4>
          </div>
          <div className="project-manager__source-actions flex gap-1.25 max-[420px]:flex-wrap max-[420px]:justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAddFiles}
              disabled={working}
            >
              + File
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAddFolders}
              disabled={working}
            >
              + Folder
            </Button>
          </div>
        </div>
        {project.primaryPath && !hasPrimaryResource ? (
          <div className="project-manager__primary-folder mt-2.75 grid min-h-12 grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.25 border-[var(--border)] border-b py-1.25 pr-8.5 pl-2.25">
            <span className="text-base text-[var(--accent)]" aria-hidden="true">
              ▱
            </span>
            <span className="grid min-w-0" title={project.primaryPath}>
              <strong className="truncate text-xs">
                {resourceLabel({
                  id: "primary",
                  kind: "folder",
                  path: project.primaryPath,
                })}
              </strong>
              <small className="truncate font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                {project.primaryPath}
              </small>
            </span>
            <b className="font-[var(--font-mono)] text-[9px] font-semibold tracking-[0.06em] text-[var(--accent)] uppercase">
              Primary
            </b>
          </div>
        ) : null}
        {resources.length ? (
          <ul className="project-manager__resources mt-2.75 grid list-none gap-0 p-0">
            {resources.map((resource) => (
              <li
                className="grid min-h-12 grid-cols-[22px_minmax(0,1fr)_auto_28px] items-center gap-2.25 border-[var(--border)] border-b py-1.25 pr-1.5 pl-2.25"
                key={resource.id}
              >
                <span
                  className={`project-manager__resource-kind project-manager__resource-kind--${resource.kind} inline-flex items-center justify-center text-[17px] ${resource.kind === "folder" ? "text-[var(--warn)]" : "text-[var(--accent)]"}`}
                  aria-hidden="true"
                >
                  {resource.kind === "folder" ? "□" : "◇"}
                </span>
                <span className="grid min-w-0" title={resource.path}>
                  <strong className="truncate text-xs">
                    {resourceLabel(resource)}
                  </strong>
                  <small className="truncate font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                    {resource.path}
                  </small>
                </span>
                {resource.kind === "folder" ? (
                  samePath(resource.path, project.primaryPath) ? (
                    <b className="project-manager__primary-badge font-[var(--font-mono)] text-[9px] font-semibold tracking-[0.06em] text-[var(--accent)] uppercase">
                      Primary
                    </b>
                  ) : (
                    <Button
                      className="project-manager__make-primary h-6.25 px-1.75 font-[var(--font-mono)] text-[9px]"
                      disabled={working}
                      onClick={() => onSetPrimaryPath(resource.path)}
                      title={`Use ${resourceLabel(resource)} for new chats and Git operations`}
                      type="button"
                      variant="outline"
                    >
                      Make primary
                    </Button>
                  )
                ) : null}
                <Button
                  type="button"
                  className="project-manager__remove-resource col-start-4 text-lg text-[var(--muted)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)]"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${resourceLabel(resource)}`}
                  onClick={() => onRemoveResource(resource)}
                  disabled={working}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="project-manager__source-empty mt-2.75 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] p-3.5 text-xs leading-6 text-[var(--muted)]">
            Add the repository, a folder, or reference files to ground this
            project.
          </div>
        )}
      </section>
      <footer className="project-manager__danger flex items-center justify-between gap-4 border-[var(--border)] border-t pt-4.25 text-[11px] text-[var(--muted)] max-[740px]:items-start max-[740px]:flex-col">
        <span>
          {project.archived
            ? "This project is archived and hidden from new chat selection."
            : "Archive a project to keep its chats and sources without clutter."}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onArchive}
          disabled={working}
        >
          {project.archived ? "Restore project" : "Archive project"}
        </Button>
      </footer>
    </>
  );
}

export function EmptyDetail({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="project-manager__empty-detail mx-auto flex min-h-full max-w-90 flex-col items-center justify-center text-center text-[var(--text-soft)]">
      <span className="text-[32px] text-[var(--accent)]" aria-hidden="true">
        ◇
      </span>
      <h3 className="mt-3.75 mb-1.5 font-[var(--font-display)] text-sm text-[var(--text)]">
        Make space for the work
      </h3>
      <p className="mt-0 mb-4.5 text-[13px] leading-[1.55]">
        Projects keep your conversations, instructions, and local context
        together without losing the global chat history.
      </p>
      {onCreate ? (
        <Button type="button" onClick={onCreate}>
          Create your first project
        </Button>
      ) : null}
    </div>
  );
}
