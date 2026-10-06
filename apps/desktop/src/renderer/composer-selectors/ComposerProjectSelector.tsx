import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@elizaos/ui/components/ui/popover";
import { Check, ChevronDown, MessageCircle, Plus, Search } from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UiIcon } from "../components/UiIcon";
import {
  type ProjectLike,
  type ProjectScope,
  projectAccentColor,
} from "../project-manager/models";
import {
  COMPOSER_ACTIONS_CLASS,
  COMPOSER_POPOVER_HEADER_CLASS,
  COMPOSER_PROJECT_GLYPH_CLASS,
  COMPOSER_PROJECT_LIST_CLASS,
  COMPOSER_PROJECT_POPOVER_CLASS,
  COMPOSER_PROJECT_TRIGGER_CLASS,
  COMPOSER_SEARCH_CLASS,
  COMPOSER_SELECTOR_ROOT_CLASS,
} from "./layout";

function ProjectGlyph({ project }: { project?: ProjectLike }) {
  return (
    <span
      aria-hidden="true"
      className={COMPOSER_PROJECT_GLYPH_CLASS}
      data-project-glyph="true"
      style={
        {
          "--composer-project-color": projectAccentColor(project?.color),
        } as CSSProperties
      }
    >
      {project?.icon?.trim() || project?.name.slice(0, 1).toUpperCase() || (
        <UiIcon icon={MessageCircle} size="xs" />
      )}
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
  const openRef = useRef(open);
  openRef.current = open;
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const document = root?.ownerDocument;
    const Observer = document?.defaultView?.MutationObserver;
    if (!root || !document || !Observer) return;
    const observer = new Observer(() => {
      if (!root.isConnected || root.closest("[hidden],[inert]")) setOpen(false);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "inert"],
    });
    return () => observer.disconnect();
  }, [open]);

  const select = (scope: ProjectScope) => {
    setOpen(false);
    onSelectProject(scope);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={COMPOSER_SELECTOR_ROOT_CLASS} ref={rootRef}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Choose project. Current project ${activeProject?.name ?? "General"}.`}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={COMPOSER_PROJECT_TRIGGER_CLASS}
            ref={triggerRef}
            title={
              activeProject?.primaryPath ??
              "General conversation without project context"
            }
            type="button"
          >
            <ProjectGlyph project={activeProject} />
            <span>{activeProject?.name ?? "General"}</span>
            <UiIcon icon={ChevronDown} size="xs" />
          </button>
        </PopoverTrigger>
        {open ? (
          <PopoverContent
            aria-label="Choose a project for this new conversation"
            align="end"
            avoidCollisions
            className={COMPOSER_PROJECT_POPOVER_CLASS}
            collisionPadding={12}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchRef.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              if (openRef.current) {
                event.preventDefault();
                return;
              }
              const active = triggerRef.current?.ownerDocument.activeElement;
              if (
                active &&
                active !== triggerRef.current?.ownerDocument.body &&
                active !== triggerRef.current &&
                !contentRef.current?.contains(active)
              ) {
                // A destination dialog/editor deliberately owns focus now.
                event.preventDefault();
              }
            }}
            ref={contentRef}
            side="top"
            sideOffset={9}
          >
            <header className={COMPOSER_POPOVER_HEADER_CLASS}>
              <span>
                <strong>Conversation project</strong>
                <small>Choose what Doolittle can see and work in.</small>
              </span>
            </header>
            <label className={`${COMPOSER_SEARCH_CLASS} m-2`}>
              <UiIcon icon={Search} size="sm" />
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
                {!activeProject ? <UiIcon icon={Check} size="xs" /> : null}
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
                    <UiIcon icon={Check} size="xs" />
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
                <UiIcon icon={Plus} size="xs" />
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
          </PopoverContent>
        ) : null}
      </div>
    </Popover>
  );
}
