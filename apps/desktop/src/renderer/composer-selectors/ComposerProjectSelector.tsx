import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import {
  COMPOSER_ACTIONS_CLASS,
  COMPOSER_POPOVER_CLASS,
  COMPOSER_POPOVER_HEADER_CLASS,
  COMPOSER_PROJECT_GLYPH_CLASS,
  COMPOSER_PROJECT_LIST_CLASS,
  COMPOSER_PROJECT_TRIGGER_CLASS,
  COMPOSER_SEARCH_CLASS,
  COMPOSER_SELECTOR_ROOT_CLASS,
} from "./layout";
import { useDismissPopover } from "./useDismissPopover";

function ProjectGlyph({ project }: { project?: ProjectLike }) {
  return (
    <span
      aria-hidden="true"
      className={COMPOSER_PROJECT_GLYPH_CLASS}
      data-project-glyph="true"
      style={
        {
          "--composer-project-color": project?.color ?? "var(--accent)",
        } as CSSProperties
      }
    >
      {project?.icon?.trim() || project?.name.slice(0, 1).toUpperCase() || "○"}
    </span>
  );
}

export function ComposerProjectSelector({
  activeProjectId,
  onChooseRepository,
  onManageProjects,
  onSelectProject,
  projects,
}: {
  activeProjectId?: string;
  onChooseRepository: () => void | Promise<void>;
  onManageProjects: () => void;
  onSelectProject: (scope: ProjectScope) => void;
  projects: readonly ProjectLike[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  useDismissPopover(open, setOpen, rootRef, triggerRef);

  const activeProject = projects.find(
    (project) => project.id === activeProjectId,
  );
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
    if (!open) {
      setQuery("");
      return;
    }
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const select = (scope: ProjectScope) => {
    setOpen(false);
    onSelectProject(scope);
  };

  return (
    <div className={COMPOSER_SELECTOR_ROOT_CLASS} ref={rootRef}>
      <button
        aria-label={`Choose project. Current project ${activeProject?.name ?? "General"}.`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={COMPOSER_PROJECT_TRIGGER_CLASS}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title={
          activeProject?.primaryPath ??
          "General conversation without project context"
        }
        type="button"
      >
        <ProjectGlyph project={activeProject} />
        <span>{activeProject?.name ?? "General"}</span>
        <i aria-hidden="true">⌄</i>
      </button>
      {open ? (
        <section
          aria-label="Choose a project for this new conversation"
          className={`${COMPOSER_POPOVER_CLASS} w-[min(340px,calc(100vw-44px))]`}
          role="dialog"
        >
          <header className={COMPOSER_POPOVER_HEADER_CLASS}>
            <span>
              <strong>Conversation project</strong>
              <small>Choose what Doolittle can see and work in.</small>
            </span>
          </header>
          <label className={`${COMPOSER_SEARCH_CLASS} m-2`}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search projects"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              ref={searchRef}
              value={query}
            />
          </label>
          <div className={COMPOSER_PROJECT_LIST_CLASS}>
            <button
              aria-current={!activeProject ? "true" : undefined}
              onClick={() => select("unscoped")}
              type="button"
            >
              <ProjectGlyph />
              <span>
                <strong>General</strong>
                <small>No repository context</small>
              </span>
              {!activeProject ? <i aria-hidden="true">✓</i> : null}
            </button>
            {visibleProjects.map((project) => (
              <button
                aria-current={
                  activeProjectId === project.id ? "true" : undefined
                }
                key={project.id}
                onClick={() => select(project.id)}
                type="button"
              >
                <ProjectGlyph project={project} />
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.primaryPath
                      ? project.primaryPath.split(/[/\\]+/u).pop()
                      : "Project context"}
                  </small>
                </span>
                {activeProjectId === project.id ? (
                  <i aria-hidden="true">✓</i>
                ) : null}
              </button>
            ))}
            {!visibleProjects.length && query ? (
              <p className="p-3 text-[10px] text-[var(--faint)]">
                No matching projects.
              </p>
            ) : null}
          </div>
          <footer className={COMPOSER_ACTIONS_CLASS}>
            <button
              onClick={() => {
                setOpen(false);
                void onChooseRepository();
              }}
              type="button"
            >
              <span aria-hidden="true">＋</span>
              Add repository
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onManageProjects();
              }}
              type="button"
            >
              Manage projects
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
