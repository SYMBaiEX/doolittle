import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../project-manager/dialog-focus";
import {
  PROJECT_MANAGER_BACKDROP_CLASS,
  PROJECT_MANAGER_BODY_CLASS,
  PROJECT_MANAGER_CLASS,
  PROJECT_MANAGER_DETAIL_CLASS,
  PROJECT_MANAGER_ERROR_CLASS,
  PROJECT_MANAGER_HEADER_CLASS,
  PROJECT_MANAGER_SEARCH_CLASS,
  PROJECT_MANAGER_TOOLBAR_CLASS,
} from "../project-manager/layout";
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
  const searchId = useId();
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
    <div className={PROJECT_MANAGER_BACKDROP_CLASS} role="presentation">
      <div
        className={`${PROJECT_MANAGER_CLASS} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={PROJECT_MANAGER_HEADER_CLASS}>
          <div>
            <span className="eyebrow">Workspace</span>
            <h2 id={titleId}>Projects</h2>
            <p>
              Keep chat context, folders, and working instructions together.
            </p>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            className="text-lg"
            size="icon-sm"
            variant="ghost"
            aria-label="Close projects"
            onClick={onClose}
            disabled={working}
          >
            ×
          </Button>
        </header>
        <div className={PROJECT_MANAGER_TOOLBAR_CLASS}>
          <label className={PROJECT_MANAGER_SEARCH_CLASS} htmlFor={searchId}>
            <span aria-hidden="true">⌕</span>
            <Input
              className="h-8 border-0 bg-transparent px-0 text-[13px] shadow-none"
              id={searchId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
            />
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => setEditing("new")}
            disabled={!onCreateProject || working}
          >
            + New
          </Button>
        </div>
        {error ? (
          <p className={PROJECT_MANAGER_ERROR_CLASS} role="alert">
            {error}
          </p>
        ) : null}
        <div className={PROJECT_MANAGER_BODY_CLASS}>
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
          <section className={PROJECT_MANAGER_DETAIL_CLASS} aria-live="polite">
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
