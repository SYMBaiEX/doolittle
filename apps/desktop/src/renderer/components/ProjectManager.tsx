import {
  type CSSProperties,
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import "./project-manager.css";

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

const COLORS = [
  "#ff6a00",
  "#e77955",
  "#d49a39",
  "#95b65e",
  "#58b8a4",
  "#7f91e7",
  "#b37bd4",
  "#d76a94",
];

function defaultDraft(project?: ProjectLike): ProjectDraft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    instructions: project?.instructions ?? "",
    color: project?.color ?? COLORS[0],
  };
}

function projectLabel(project: ProjectLike) {
  return project.icon?.trim() || project.name.slice(0, 1).toUpperCase() || "P";
}

function resourceLabel(resource: ProjectResourceLike) {
  return (
    resource.label?.trim() ||
    resource.path.split(/[\\/]/u).filter(Boolean).at(-1) ||
    resource.path
  );
}

function samePath(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const normalizedLeft = left.replace(/[\\/]+$/u, "");
  const normalizedRight = right.replace(/[\\/]+$/u, "");
  return window.doolittle.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function formatCount(count: number | undefined) {
  if (!count) return "No chats";
  return `${count} ${count === 1 ? "chat" : "chats"}`;
}

function isFocusable(element: HTMLElement) {
  return !element.hasAttribute("disabled") && !element.hasAttribute("hidden");
}

export function shouldHandleDialogKey(
  key: string,
  suspended: boolean,
): boolean {
  return !suspended && (key === "Escape" || key === "Tab");
}

function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  suspended = false,
) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    requestAnimationFrame(
      () => initialFocusRef.current?.focus() ?? dialogRef.current?.focus(),
    );
    const keydown = (event: KeyboardEvent) => {
      if (!shouldHandleDialogKey(event.key, suspendedRef.current)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(isFocusable);
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      const previous = previousFocus.current;
      previousFocus.current = null;
      if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
    };
  }, [dialogRef, initialFocusRef, open]);
}

function ProjectAvatar({
  project,
  size = "regular",
}: {
  project: ProjectLike;
  size?: "small" | "regular";
}) {
  return (
    <span
      className={`project-avatar project-avatar--${size}`}
      style={{ "--project-color": project.color ?? COLORS[0] } as CSSProperties}
      aria-hidden="true"
    >
      {projectLabel(project)}
    </span>
  );
}

export function ProjectSwitcher({
  projects,
  activeScope,
  unscopedChatCount = 0,
  allChatCount,
  onScopeChange,
  onOpenProjectManager,
  className = "",
}: Pick<
  ProjectManagerProps,
  | "projects"
  | "activeScope"
  | "unscopedChatCount"
  | "allChatCount"
  | "onScopeChange"
  | "onOpenProjectManager"
  | "className"
>) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      projects.filter(
        (project) =>
          !project.archived &&
          project.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [projects, query],
  );
  const activeProject =
    typeof activeScope === "string"
      ? projects.find((project) => project.id === activeScope)
      : undefined;
  const label =
    activeScope === "all"
      ? "All chats"
      : activeScope === "unscoped"
        ? "Unscoped"
        : (activeProject?.name ?? "Project");

  return (
    <div className={`project-switcher ${className}`}>
      <button
        type="button"
        className="project-switcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {activeProject ? (
          <ProjectAvatar project={activeProject} size="small" />
        ) : (
          <span className="project-switcher__all-mark" aria-hidden="true">
            ⌘
          </span>
        )}
        <span className="project-switcher__label">{label}</span>
        <span className="project-switcher__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {expanded ? (
        <div
          className="project-switcher__menu"
          role="dialog"
          aria-label="Choose project"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
          />
          <div
            className="project-switcher__scopes"
            role="listbox"
            aria-label="Chat scope"
          >
            <ScopeButton
              active={activeScope === "all"}
              label="All chats"
              count={allChatCount}
              onClick={() => {
                onScopeChange("all");
                setExpanded(false);
              }}
            />
            <ScopeButton
              active={activeScope === "unscoped"}
              label="Unscoped"
              count={unscopedChatCount}
              onClick={() => {
                onScopeChange("unscoped");
                setExpanded(false);
              }}
            />
          </div>
          {visible.length ? (
            <div
              className="project-switcher__projects"
              role="listbox"
              aria-label="Projects"
            >
              {visible.map((project) => (
                <button
                  type="button"
                  className={`project-switcher__item ${activeScope === project.id ? "is-active" : ""}`}
                  key={project.id}
                  role="option"
                  aria-selected={activeScope === project.id}
                  onClick={() => {
                    onScopeChange(project.id);
                    setExpanded(false);
                  }}
                >
                  <ProjectAvatar project={project} size="small" />
                  <span>{project.name}</span>
                  <small>{formatCount(project.chatCount)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="project-switcher__empty">No matching projects.</p>
          )}
          {onOpenProjectManager ? (
            <button
              type="button"
              className="project-switcher__create"
              onClick={() => {
                onOpenProjectManager();
                setExpanded(false);
              }}
            >
              + New project
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ScopeButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`project-switcher__item ${active ? "is-active" : ""}`}
      role="option"
      aria-selected={active}
      onClick={onClick}
    >
      <span className="project-switcher__scope-mark" aria-hidden="true">
        {label === "All chats" ? "⌘" : "○"}
      </span>
      <span>{label}</span>
      {typeof count === "number" ? <small>{formatCount(count)}</small> : null}
    </button>
  );
}

export function ProjectManager(props: ProjectManagerProps) {
  const {
    projects,
    activeScope,
    currentChatId,
    currentChatProjectId,
    isOpen,
    onClose,
    onScopeChange,
    onCreateProject,
    onUpdateProject,
    onArchiveProject,
    onPinProject,
    onAddFiles,
    onAddFolders,
    onRemoveResource,
    onSetPrimaryPath,
    onMoveCurrentChat,
    className = "",
  } = props;
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ProjectLike | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useDialogFocus(isOpen, dialogRef, closeButtonRef, onClose, Boolean(editing));

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setShowArchived(false);
      setEditing(null);
      setError("");
    }
  }, [isOpen]);
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects
      .filter(
        (project) =>
          (showArchived ? project.archived : !project.archived) &&
          (!needle ||
            `${project.name} ${project.description ?? ""}`
              .toLowerCase()
              .includes(needle)),
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
          a.name.localeCompare(b.name),
      );
  }, [projects, query, showArchived]);
  const selected =
    projects.find((project) => project.id === selectedId) ??
    (typeof activeScope === "string"
      ? projects.find((project) => project.id === activeScope)
      : undefined) ??
    visibleProjects.at(0);
  const pinned = visibleProjects.filter((project) => project.pinned);
  const regular = visibleProjects.filter((project) => !project.pinned);

  const call = async (action: (() => void | Promise<void>) | undefined) => {
    if (!action) return;
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That change could not be saved. Try again.",
      );
    } finally {
      setWorking(false);
    }
  };
  const selectScope = (scope: ProjectScope) => {
    onScopeChange(scope);
    if (typeof scope === "string" && scope !== "all" && scope !== "unscoped")
      setSelectedId(scope);
  };

  if (!isOpen) return null;
  return (
    <div className="project-manager-backdrop" role="presentation">
      <div
        className={`project-manager ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="project-manager__header">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2 id={titleId}>Projects</h2>
            <p>
              Keep chat context, folders, and working instructions together.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            aria-label="Close projects"
            onClick={onClose}
            disabled={working}
          >
            ×
          </button>
        </header>
        <div className="project-manager__toolbar">
          <label className="project-manager__search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
            />
          </label>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setEditing("new")}
            disabled={!onCreateProject || working}
          >
            + New
          </button>
        </div>
        {error ? (
          <p className="project-manager__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="project-manager__body">
          <aside className="project-manager__list" aria-label="Project list">
            <button
              type="button"
              className={`project-manager__scope ${activeScope === "all" ? "is-active" : ""}`}
              onClick={() => selectScope("all")}
            >
              <span>⌘</span>
              <strong>All chats</strong>
              <small>{formatCount(props.allChatCount)}</small>
            </button>
            <button
              type="button"
              className={`project-manager__scope ${activeScope === "unscoped" ? "is-active" : ""}`}
              onClick={() => selectScope("unscoped")}
            >
              <span>○</span>
              <strong>Unscoped</strong>
              <small>{formatCount(props.unscopedChatCount)}</small>
            </button>
            <div className="project-manager__group-label">
              <span>Pinned</span>
            </div>
            {pinned.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                selected={selected?.id === project.id}
                active={activeScope === project.id}
                onClick={() => {
                  setSelectedId(project.id);
                  selectScope(project.id);
                }}
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
                selected={selected?.id === project.id}
                active={activeScope === project.id}
                onClick={() => {
                  setSelectedId(project.id);
                  selectScope(project.id);
                }}
              />
            ))}
            {!visibleProjects.length ? (
              <p className="project-manager__empty">
                {showArchived ? "No archived projects." : "No projects yet."}
              </p>
            ) : null}
            <button
              type="button"
              className="project-manager__archive-toggle"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived
                ? "← Active projects"
                : `Archived (${projects.filter((project) => project.archived).length})`}
            </button>
          </aside>
          <section className="project-manager__detail" aria-live="polite">
            {selected ? (
              <ProjectDetail
                project={selected}
                currentChatId={currentChatId}
                currentChatProjectId={currentChatProjectId}
                onEdit={() => setEditing(selected)}
                onArchive={() =>
                  call(() => onArchiveProject?.(selected, !selected.archived))
                }
                onPin={() =>
                  call(() => onPinProject?.(selected, !selected.pinned))
                }
                onAddFiles={() => call(() => onAddFiles?.(selected))}
                onAddFolders={() => call(() => onAddFolders?.(selected))}
                onRemoveResource={(resource) =>
                  call(() => onRemoveResource?.(selected, resource))
                }
                onSetPrimaryPath={(path) =>
                  call(() => onSetPrimaryPath?.(selected, path))
                }
                onMoveCurrentChat={() =>
                  call(() => onMoveCurrentChat?.(selected.id))
                }
                onUnscopeCurrentChat={() =>
                  call(() => onMoveCurrentChat?.(null))
                }
                working={working}
              />
            ) : (
              <EmptyDetail
                onCreate={onCreateProject ? () => setEditing("new") : undefined}
              />
            )}
          </section>
        </div>
        {editing ? (
          <ProjectEditor
            project={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
            onSubmit={(draft) =>
              call(async () => {
                if (editing === "new") await onCreateProject?.(draft);
                else await onUpdateProject?.(editing, draft);
                setEditing(null);
              })
            }
            saving={working}
          />
        ) : null}
      </div>
    </div>
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

function ProjectDetail({
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

function EmptyDetail({ onCreate }: { onCreate?: () => void }) {
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

export function ProjectEditor({
  project,
  onClose,
  onSubmit,
  saving,
}: {
  project?: ProjectLike;
  onClose: () => void;
  onSubmit: (draft: ProjectDraft) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(() => defaultDraft(project));
  const titleId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  useDialogFocus(true, dialogRef, firstInput, onClose);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
    });
  };
  return (
    <div className="project-editor-backdrop" role="presentation">
      <form
        className="project-editor"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow">
              {project ? "Project settings" : "New project"}
            </span>
            <h3 id={titleId}>
              {project ? `Edit ${project.name}` : "Create a project"}
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close project editor"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>
        <label>
          Name
          <input
            ref={firstInput}
            value={draft.name}
            onChange={(event) =>
              setDraft((value) => ({ ...value, name: event.target.value }))
            }
            placeholder="e.g. Doolittle Desktop"
            required
            maxLength={100}
          />
        </label>
        <label>
          Description <small>Optional, shown in the project switcher.</small>
          <input
            value={draft.description}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                description: event.target.value,
              }))
            }
            placeholder="What are you working on?"
            maxLength={280}
          />
        </label>
        <label>
          Project instructions{" "}
          <small>Shared context for every new chat in this project.</small>
          <textarea
            rows={5}
            value={draft.instructions}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                instructions: event.target.value,
              }))
            }
            placeholder="Goals, conventions, or things Doolittle should remember…"
            maxLength={4000}
          />
        </label>
        <fieldset>
          <legend>Accent</legend>
          <div className="project-editor__colors">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={draft.color === color ? "is-selected" : ""}
                style={{ background: color }}
                aria-label={`Use ${color} accent`}
                aria-pressed={draft.color === color}
                onClick={() => setDraft((value) => ({ ...value, color }))}
              />
            ))}
          </div>
        </fieldset>
        <footer>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={saving || !draft.name.trim()}
          >
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </button>
        </footer>
      </form>
    </div>
  );
}
