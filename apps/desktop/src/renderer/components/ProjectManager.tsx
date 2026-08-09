import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./project-manager.css";
import { useDialogFocus } from "../project-manager/dialog-focus";
import type {
  ProjectDraft,
  ProjectLike,
  ProjectManagerProps,
  ProjectScope,
} from "../project-manager/models";
import { EmptyDetail, ProjectDetail } from "../project-manager/ProjectDetail";
import { ProjectEditor } from "../project-manager/ProjectEditor";
import { ProjectList } from "../project-manager/ProjectList";

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
  const selectProject = (project: ProjectLike) => {
    setSelectedId(project.id);
    selectScope(project.id);
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
          <ProjectList
            activeScope={activeScope}
            allChatCount={props.allChatCount}
            archivedCount={
              projects.filter((project) => project.archived).length
            }
            onSelectProject={selectProject}
            onSelectScope={selectScope}
            onToggleArchived={() => setShowArchived((value) => !value)}
            pinned={pinned}
            regular={regular}
            selectedId={selected?.id ?? null}
            showArchived={showArchived}
            unscopedChatCount={props.unscopedChatCount}
          />
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
            onSubmit={(draft: ProjectDraft) =>
              void call(async () => {
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
