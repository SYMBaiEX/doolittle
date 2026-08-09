import { useMemo, useState } from "react";
import {
  formatCount,
  type ProjectManagerProps,
  type ProjectScope,
} from "./models";
import { ProjectAvatar } from "./ProjectAvatar";

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

  const chooseScope = (scope: ProjectScope) => {
    onScopeChange(scope);
    setExpanded(false);
  };

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
              onClick={() => chooseScope("all")}
            />
            <ScopeButton
              active={activeScope === "unscoped"}
              label="Unscoped"
              count={unscopedChatCount}
              onClick={() => chooseScope("unscoped")}
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
                  onClick={() => chooseScope(project.id)}
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
