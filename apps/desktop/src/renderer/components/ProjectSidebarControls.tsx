import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import {
  NEW_CHAT_CHOICE_CLASS,
  NEW_CHAT_MENU_CLASS,
  NEW_CHAT_MENU_HEADER_CLASS,
  NEW_CHAT_SEARCH_CLASS,
  NEW_CHAT_SHELL_CLASS,
  NEW_CHAT_TRIGGER_CLASS,
  PROJECT_MARK_CLASS,
} from "./project-sidebar-layout";
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
      className={PROJECT_MARK_CLASS}
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
    <div className={NEW_CHAT_SHELL_CLASS} ref={shellRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="New conversation"
        className={NEW_CHAT_TRIGGER_CLASS}
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
          className={NEW_CHAT_MENU_CLASS}
          ref={menuRef}
          role="dialog"
        >
          <header className={NEW_CHAT_MENU_HEADER_CLASS}>
            <div>
              <strong>Start in a project</strong>
              <small>Choose the repository Doolittle should work in.</small>
            </div>
            <button
              aria-label="Close new conversation menu"
              className="new-chat-project-menu__close grid size-6 place-items-center rounded-[var(--radius-xs)] border border-transparent p-0 text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              ×
            </button>
          </header>
          {projects.filter((project) => !project.archived).length > 5 ? (
            <label className={NEW_CHAT_SEARCH_CLASS}>
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search projects"
                className="min-h-7.75 w-full border-0 bg-transparent p-0 text-xs text-[var(--text)] outline-0"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a project"
                ref={searchRef}
                value={query}
              />
            </label>
          ) : null}
          <div className="new-chat-project-menu__list grid max-h-59 gap-0.5 overflow-y-auto p-1.75">
            {visibleProjects.map((project) => (
              <button
                aria-current={activeScope === project.id ? "true" : undefined}
                className={`${NEW_CHAT_CHOICE_CLASS} ${activeScope === project.id ? "is-current [&>i]:text-[var(--accent)]" : ""}`}
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
              <p className="m-1.75 text-[11px] text-[var(--muted)]">
                No matching projects.
              </p>
            ) : null}
          </div>
          <div className="new-chat-project-menu__actions grid gap-0.5 border-[var(--border)] border-t p-1.75">
            <button
              className={NEW_CHAT_CHOICE_CLASS}
              data-new-chat-choice
              onClick={() => {
                onOpenChange(false);
                void onChooseRepository();
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="grid size-6.75 place-items-center rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] text-[var(--accent)]"
              >
                ▱
              </span>
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
              className={NEW_CHAT_CHOICE_CLASS}
              onClick={() => choose("unscoped")}
              type="button"
            >
              <span
                aria-hidden="true"
                className="grid size-6.75 place-items-center rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] text-[var(--accent)]"
              >
                ○
              </span>
              <span>
                <strong>General chat</strong>
                <small>Start without repository context</small>
              </span>
              {activeScope === "unscoped" ? <i aria-hidden="true">✓</i> : null}
            </button>
          </div>
          <footer className="border-[var(--border)] border-t px-3 pt-2 pb-2.5">
            <button
              className="flex min-h-6 w-full justify-between p-0.5 font-[var(--font-mono)] text-[10px] text-[var(--muted)] hover:text-[var(--accent)]"
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
