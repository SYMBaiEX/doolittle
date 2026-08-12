import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import { repositoryLabel } from "./project-sidebar-model";

export function projectLocationLabel(project: ProjectLike): string {
  const repository = repositoryLabel(project.primaryPath);
  return repository.localeCompare(project.name, undefined, {
    sensitivity: "base",
  }) === 0
    ? "Local repository"
    : repository;
}

export function ProjectMark({ project }: { project: ProjectLike }) {
  return (
    <span
      aria-hidden="true"
      className="project-rail-mark"
      style={
        {
          "--project-color": project.color ?? "var(--accent)",
        } as CSSProperties
      }
    >
      {project.icon?.trim() || project.name.slice(0, 1).toUpperCase() || "R"}
    </span>
  );
}

interface NewConversationControlProps {
  projects: readonly ProjectLike[];
  activeScope: ProjectScope;
  isOpen: boolean;
  shortcut: string;
  onOpenChange: (open: boolean) => void;
  onStart: (scope: ProjectScope) => void;
  onChooseRepository: () => void | Promise<void>;
  onManageProjects: () => void;
}

export function NewConversationControl({
  projects,
  activeScope,
  isOpen,
  shortcut,
  onOpenChange,
  onStart,
  onChooseRepository,
  onManageProjects,
}: NewConversationControlProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects
      .filter(
        (project) =>
          !project.archived &&
          (!needle ||
            `${project.name} ${project.primaryPath ?? ""}`
              .toLowerCase()
              .includes(needle)),
      )
      .sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return left.pinned ? -1 : 1;
        }
        return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
      });
  }, [projects, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !shellRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    if (visibleProjects.length > 5) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      requestAnimationFrame(() =>
        menuRef.current
          ?.querySelector<HTMLButtonElement>("[data-new-chat-choice]")
          ?.focus(),
      );
    }
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onOpenChange, visibleProjects.length]);

  const choose = (scope: ProjectScope) => {
    onOpenChange(false);
    onStart(scope);
  };

  return (
    <div className="sidebar-new-chat-shell" ref={shellRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="New conversation"
        onClick={() => onOpenChange(!isOpen)}
        ref={triggerRef}
        title="New conversation"
        type="button"
      >
        <span aria-hidden="true">＋</span>
        <strong>New conversation</strong>
        <kbd>{shortcut}</kbd>
      </button>
      {isOpen ? (
        <div
          aria-label="Start a new conversation"
          className="new-chat-project-menu"
          ref={menuRef}
          role="dialog"
        >
          <header>
            <div>
              <strong>Start in a project</strong>
              <small>Choose the repository Doolittle should work in.</small>
            </div>
            <button
              aria-label="Close new conversation menu"
              className="new-chat-project-menu__close"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              ×
            </button>
          </header>
          {projects.filter((project) => !project.archived).length > 5 ? (
            <label className="new-chat-project-menu__search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search projects"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a project"
                ref={searchRef}
                value={query}
              />
            </label>
          ) : null}
          <div className="new-chat-project-menu__list">
            {visibleProjects.map((project) => (
              <button
                aria-current={activeScope === project.id ? "true" : undefined}
                className={
                  activeScope === project.id ? "is-current" : undefined
                }
                data-new-chat-choice
                key={project.id}
                onClick={() => choose(project.id)}
                type="button"
              >
                <ProjectMark project={project} />
                <span>
                  <strong>{project.name}</strong>
                  <small>{projectLocationLabel(project)}</small>
                </span>
                <i aria-hidden="true">
                  {activeScope === project.id ? "✓" : "↗"}
                </i>
              </button>
            ))}
            {visibleProjects.length === 0 && query ? (
              <p>No matching projects.</p>
            ) : null}
          </div>
          <div className="new-chat-project-menu__actions">
            <button
              data-new-chat-choice
              onClick={() => {
                onOpenChange(false);
                void onChooseRepository();
              }}
              type="button"
            >
              <span aria-hidden="true">▱</span>
              <span>
                <strong>Choose repository…</strong>
                <small>Create or reopen a local project</small>
              </span>
              <i aria-hidden="true">
                {window.doolittle.platform === "darwin" ? "⌘O" : "Ctrl O"}
              </i>
            </button>
            <button
              aria-current={activeScope === "unscoped" ? "true" : undefined}
              onClick={() => choose("unscoped")}
              type="button"
            >
              <span aria-hidden="true">○</span>
              <span>
                <strong>General chat</strong>
                <small>Start without repository context</small>
              </span>
              {activeScope === "unscoped" ? <i aria-hidden="true">✓</i> : null}
            </button>
          </div>
          <footer>
            <button
              onClick={() => {
                onOpenChange(false);
                onManageProjects();
              }}
              type="button"
            >
              Manage project context and sources
              <span aria-hidden="true">→</span>
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
