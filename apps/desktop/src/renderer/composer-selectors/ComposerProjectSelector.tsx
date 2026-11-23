import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@elizaos/ui/components/ui/popover";
import {
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  LockKeyhole,
  type LucideIcon,
  Monitor,
  Search,
} from "lucide-react";
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
  COMPOSER_SECTION_LABEL_CLASS,
  COMPOSER_SELECTOR_ROOT_CLASS,
} from "./layout";

export type ChatWorkspaceTarget =
  | { kind: "local"; projectId: string; name: string; path: string }
  | { kind: "pending"; name: string }
  | { kind: "private" }
  | { kind: "unconfirmed" };

function ProjectGlyph({
  icon = Folder,
  project,
}: {
  icon?: LucideIcon;
  project?: ProjectLike;
}) {
  return (
    <span
      aria-hidden="true"
      className={COMPOSER_PROJECT_GLYPH_CLASS}
      data-project-glyph="true"
      style={
        {
          "--composer-project-color": project
            ? projectAccentColor(project.color)
            : "var(--text-soft)",
        } as CSSProperties
      }
    >
      {project?.icon?.trim() || project?.name.slice(0, 1).toUpperCase() || (
        <UiIcon icon={icon} size="xs" />
      )}
    </span>
  );
}

export function ComposerProjectSelector({
  target,
  onChooseRepository,
  onManageProjects,
  onSelectProject,
  projects,
}: {
  target: ChatWorkspaceTarget;
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
  const localFolderRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const label =
    target.kind === "local"
      ? `This computer · ${target.name}`
      : target.kind === "pending"
        ? `${target.name} · Approval needed`
        : target.kind === "private"
          ? "Private workspace"
          : "Workspace not confirmed";
  const savedFolders = useMemo(
    () =>
      projects
        .filter((project) => !project.archived && project.primaryPath?.trim())
        .sort((left, right) => {
          if (Boolean(left.pinned) !== Boolean(right.pinned)) {
            return left.pinned ? -1 : 1;
          }
          return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
        }),
    [projects],
  );
  const needle = query.trim().toLowerCase();
  const visibleProjects = needle
    ? savedFolders.filter((project) =>
        `${project.name} ${project.primaryPath}`.toLowerCase().includes(needle),
      )
    : savedFolders;

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
            aria-label={`Choose workspace. Current workspace ${label}.`}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={COMPOSER_PROJECT_TRIGGER_CLASS}
            ref={triggerRef}
            title={target.kind === "local" ? target.path : label}
            type="button"
          >
            <ProjectGlyph
              icon={
                target.kind === "local"
                  ? Monitor
                  : target.kind === "private"
                    ? LockKeyhole
                    : Folder
              }
            />
            <span className="composer-route-label">
              {target.kind === "local" || target.kind === "pending"
                ? target.name
                : label}
            </span>
            {target.kind === "local" || target.kind === "pending" ? (
              <span aria-hidden="true" className="composer-route-mode">
                {target.kind === "local" ? "Local" : "Approval needed"}
              </span>
            ) : null}
            <UiIcon icon={ChevronDown} size="xs" />
          </button>
        </PopoverTrigger>
        {open ? (
          <PopoverContent
            aria-label="Choose a workspace for a new chat"
            align="end"
            avoidCollisions
            className={COMPOSER_PROJECT_POPOVER_CLASS}
            collisionPadding={12}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              localFolderRef.current?.focus({ preventScroll: true });
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
              <span className="min-w-0">
                <strong>New chat workspace</strong>
                {target.kind === "local" ? (
                  <small className="truncate" title={target.path}>
                    {target.path}
                  </small>
                ) : null}
              </span>
            </header>
            <div className="min-h-0 overflow-y-auto p-1.75">
              <section
                aria-label="This computer"
                className={COMPOSER_PROJECT_LIST_CLASS}
              >
                <h3 className={COMPOSER_SECTION_LABEL_CLASS}>This computer</h3>
                <button
                  onClick={() => {
                    setOpen(false);
                    void onChooseRepository();
                  }}
                  ref={localFolderRef}
                  type="button"
                >
                  <ProjectGlyph icon={FolderOpen} />
                  <span>
                    <strong>Choose local folder</strong>
                    <small>Open a project on this computer.</small>
                  </span>
                </button>
              </section>
              {savedFolders.length > 0 ? (
                <section
                  aria-label="Saved folders"
                  className={`${COMPOSER_PROJECT_LIST_CLASS} mt-1`}
                >
                  <h3 className={COMPOSER_SECTION_LABEL_CLASS}>
                    Saved folders
                  </h3>
                  <label className={`${COMPOSER_SEARCH_CLASS} mx-1.75 my-1`}>
                    <UiIcon icon={Search} size="sm" />
                    <input
                      aria-label="Search saved folders"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search saved folders"
                      value={query}
                    />
                  </label>
                  {visibleProjects.map((project) => {
                    const current =
                      target.kind === "local" &&
                      target.projectId === project.id &&
                      target.path === project.primaryPath;
                    return (
                      <button
                        aria-current={current ? "true" : undefined}
                        key={project.id}
                        onClick={() => select(project.id)}
                        title={project.primaryPath}
                        type="button"
                      >
                        <ProjectGlyph project={project} />
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.primaryPath}</small>
                        </span>
                        {current ? <UiIcon icon={Check} size="xs" /> : null}
                      </button>
                    );
                  })}
                  {!visibleProjects.length && needle ? (
                    <p className="m-0 p-2 text-[length:var(--text-control)] text-[var(--faint)]">
                      No matching folders.
                    </p>
                  ) : null}
                </section>
              ) : null}
              <section
                aria-label="Private workspace"
                className={`${COMPOSER_PROJECT_LIST_CLASS} mt-1.5`}
              >
                <button
                  aria-current={target.kind === "private" ? "true" : undefined}
                  onClick={() => select("unscoped")}
                  type="button"
                >
                  <ProjectGlyph icon={LockKeyhole} />
                  <span>
                    <strong>Private workspace</strong>
                    <small>Use Doolittle’s own folder.</small>
                  </span>
                  {target.kind === "private" ? (
                    <UiIcon icon={Check} size="xs" />
                  ) : null}
                </button>
              </section>
            </div>
            <footer className={COMPOSER_ACTIONS_CLASS}>
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
