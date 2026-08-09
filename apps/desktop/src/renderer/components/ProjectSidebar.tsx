import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SessionSummary } from "../../shared/contracts";
import {
  CONVERSATION_PINS_EVENT,
  loadConversationPins,
  saveConversationPins,
} from "../conversation-persistence";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import {
  buildProjectSidebarModel,
  conversationLabel,
  repositoryLabel,
} from "./project-sidebar-model";
import "./project-sidebar.css";

function projectLocationLabel(project: ProjectLike): string {
  const repository = repositoryLabel(project.primaryPath);
  return repository.localeCompare(project.name, undefined, {
    sensitivity: "base",
  }) === 0
    ? "Local repository"
    : repository;
}

function sessionActivityLabel(session: SessionSummary): string {
  const value = session.endedAt ?? session.startedAt;
  if (!value) return "";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "";
  const elapsed = Date.now() - timestamp.getTime();
  const day = 86_400_000;
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000)
    return `${Math.max(1, Math.floor(elapsed / 60_000))}m`;
  if (elapsed < day) return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h`;
  if (elapsed < day * 7) return `${Math.max(1, Math.floor(elapsed / day))}d`;
  return timestamp.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ProjectMark({ project }: { project: ProjectLike }) {
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
                {activeScope === project.id ? (
                  <i aria-hidden="true">✓</i>
                ) : (
                  <i aria-hidden="true">↗</i>
                )}
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

interface ProjectHistorySidebarProps {
  projects: readonly ProjectLike[];
  sessions: readonly SessionSummary[];
  activeScope: ProjectScope;
  selectedSessionId: string;
  isChatView: boolean;
  onSelectScope: (scope: ProjectScope) => void;
  onOpenSession: (sessionId: string) => void;
  onStartConversation: (scope: ProjectScope) => void;
  onChooseRepository: () => void | Promise<void>;
  onManageProjects: () => void;
  onViewAll: () => void;
}

export function ProjectHistorySidebar({
  projects,
  sessions,
  activeScope,
  selectedSessionId,
  isChatView,
  onSelectScope,
  onOpenSession,
  onStartConversation,
  onChooseRepository,
  onManageProjects,
  onViewAll,
}: ProjectHistorySidebarProps) {
  const [pinnedSessions, setPinnedSessions] = useState(() =>
    loadConversationPins(localStorage),
  );
  const model = useMemo(
    () =>
      buildProjectSidebarModel(
        projects,
        sessions,
        5,
        new Set(Object.keys(pinnedSessions)),
      ),
    [pinnedSessions, projects, sessions],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = projects
      .filter((project) => project.pinned)
      .map((project) => project.id);
    if (activeScope !== "all" && activeScope !== "unscoped") {
      initial.push(activeScope);
    }
    return new Set(initial);
  });

  useEffect(() => {
    if (activeScope === "all") return;
    setExpanded((current) => {
      if (current.has(activeScope)) return current;
      return new Set([...current, activeScope]);
    });
  }, [activeScope]);

  useEffect(() => {
    const syncPins = () =>
      setPinnedSessions(loadConversationPins(localStorage));
    window.addEventListener(CONVERSATION_PINS_EVENT, syncPins);
    return () => window.removeEventListener(CONVERSATION_PINS_EVENT, syncPins);
  }, []);

  const togglePinnedSession = (sessionId: string) => {
    setPinnedSessions((current) => {
      const next = { ...current };
      if (next[sessionId]) delete next[sessionId];
      else next[sessionId] = true;
      saveConversationPins(localStorage, next);
      window.dispatchEvent(new Event(CONVERSATION_PINS_EVENT));
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderSessions = (
    entries: readonly SessionSummary[],
    scope: ProjectScope,
    chatCount: number,
  ) => {
    const hasCurrentDraft =
      isChatView &&
      activeScope === scope &&
      Boolean(selectedSessionId) &&
      !sessions.some((session) => session.sessionId === selectedSessionId);
    if (entries.length === 0) {
      if (hasCurrentDraft) {
        return (
          <button
            aria-current="true"
            className="project-rail-chat is-selected"
            onClick={() => onOpenSession(selectedSessionId)}
            type="button"
          >
            <i aria-hidden="true" />
            <span>Current draft</span>
          </button>
        );
      }
      return (
        <button
          className="project-rail-empty"
          onClick={() => onStartConversation(scope)}
          type="button"
        >
          Start the first chat
        </button>
      );
    }
    return (
      <>
        {hasCurrentDraft ? (
          <button
            aria-current="true"
            className="project-rail-chat is-selected"
            onClick={() => onOpenSession(selectedSessionId)}
            type="button"
          >
            <i aria-hidden="true" />
            <span>Current draft</span>
          </button>
        ) : null}
        {entries.map((session) => {
          const selected =
            isChatView && selectedSessionId === session.sessionId;
          const pinned = Boolean(pinnedSessions[session.sessionId]);
          return (
            <div
              className={`project-rail-chat-row ${
                selected ? "is-selected" : ""
              } ${pinned ? "is-pinned" : ""}`}
              key={session.sessionId}
            >
              <button
                aria-current={selected ? "true" : undefined}
                className={`project-rail-chat ${selected ? "is-selected" : ""}`}
                onClick={() => onOpenSession(session.sessionId)}
                title={conversationLabel(session)}
                type="button"
              >
                <i aria-hidden="true" />
                <span className="project-rail-chat__title">
                  {conversationLabel(session)}
                </span>
                <time dateTime={session.endedAt ?? session.startedAt}>
                  {sessionActivityLabel(session)}
                </time>
              </button>
              <button
                aria-label={`${pinned ? "Unpin" : "Pin"} ${conversationLabel(
                  session,
                )}`}
                aria-pressed={pinned}
                className="project-rail-chat-pin"
                onClick={() => togglePinnedSession(session.sessionId)}
                title={pinned ? "Unpin conversation" : "Pin conversation"}
                type="button"
              >
                ⌁
              </button>
            </div>
          );
        })}
        {chatCount > entries.length ? (
          <button
            className="project-rail-more"
            onClick={() => {
              onSelectScope(scope);
              onViewAll();
            }}
            type="button"
          >
            {chatCount - entries.length} more
          </button>
        ) : null}
      </>
    );
  };

  return (
    <section
      aria-labelledby="sidebar-projects"
      className={`sidebar-projects ${
        isChatView ? "" : "sidebar-projects--workspace"
      }`}
    >
      <div className="sidebar-projects__heading">
        <span id="sidebar-projects">
          Projects
          <small>{model.projects.length}</small>
        </span>
        <div>
          <button
            aria-label="Choose a repository"
            onClick={() => void onChooseRepository()}
            title="Choose a repository"
            type="button"
          >
            <span aria-hidden="true">＋</span>
          </button>
          <button
            aria-label="Manage projects"
            onClick={onManageProjects}
            title="Manage projects"
            type="button"
          >
            <span aria-hidden="true">•••</span>
          </button>
        </div>
      </div>
      <button
        aria-current={activeScope === "all" ? "page" : undefined}
        className={`project-rail-all ${
          activeScope === "all" ? "is-active" : ""
        }`}
        onClick={() => onSelectScope("all")}
        title={isChatView ? "All conversations" : "All projects"}
        type="button"
      >
        <span aria-hidden="true">◷</span>
        <span>
          <strong>{isChatView ? "All conversations" : "All projects"}</strong>
          <em>
            {isChatView
              ? "Browse recent and pinned chats"
              : "Change the active workspace"}
          </em>
        </span>
        <small>{isChatView ? sessions.length : model.projects.length}</small>
      </button>
      <div className="sidebar-projects__list">
        {model.projects.map(({ project, sessions: chats, chatCount }) => {
          const isExpanded = expanded.has(project.id);
          const isActive = activeScope === project.id;
          return (
            <div
              className={`project-rail-group ${isActive ? "is-active" : ""}`}
              key={project.id}
            >
              <div className="project-rail-row">
                <button
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${
                    project.name
                  } chats`}
                  className="project-rail-disclosure"
                  onClick={() => toggleExpanded(project.id)}
                  type="button"
                >
                  <span aria-hidden="true">›</span>
                </button>
                <button
                  className="project-rail-main"
                  onClick={() => {
                    onSelectScope(project.id);
                    setExpanded((current) => new Set([...current, project.id]));
                  }}
                  title={project.primaryPath ?? project.name}
                  type="button"
                >
                  <ProjectMark project={project} />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{projectLocationLabel(project)}</small>
                  </span>
                </button>
                <button
                  aria-label={`New chat in ${project.name}`}
                  className="project-rail-new"
                  onClick={() => onStartConversation(project.id)}
                  title={`New chat in ${project.name}`}
                  type="button"
                >
                  +
                </button>
                <small className="project-rail-count">{chatCount}</small>
              </div>
              {isChatView && isExpanded ? (
                <div className="project-rail-chats">
                  {renderSessions(chats, project.id, chatCount)}
                </div>
              ) : null}
            </div>
          );
        })}
        {model.projects.length === 0 ? (
          <button
            className="project-rail-onboarding"
            onClick={() => void onChooseRepository()}
            type="button"
          >
            <span aria-hidden="true">▱</span>
            <strong>Add your first repository</strong>
            <small>Projects keep chats and code together.</small>
          </button>
        ) : null}
        {model.unscopedChatCount > 0 || activeScope === "unscoped" ? (
          <div
            className={`project-rail-group project-rail-group--general ${
              activeScope === "unscoped" ? "is-active" : ""
            }`}
          >
            <div className="project-rail-row">
              <button
                aria-expanded={expanded.has("unscoped")}
                aria-label={`${
                  expanded.has("unscoped") ? "Collapse" : "Expand"
                } general chats`}
                className="project-rail-disclosure"
                onClick={() => toggleExpanded("unscoped")}
                type="button"
              >
                <span aria-hidden="true">›</span>
              </button>
              <button
                className="project-rail-main"
                onClick={() => onSelectScope("unscoped")}
                type="button"
              >
                <span aria-hidden="true" className="project-rail-general-mark">
                  ○
                </span>
                <span>
                  <strong>General</strong>
                  <small>No repository</small>
                </span>
              </button>
              <button
                aria-label="New general chat"
                className="project-rail-new"
                onClick={() => onStartConversation("unscoped")}
                title="New general chat"
                type="button"
              >
                +
              </button>
              <small className="project-rail-count">
                {model.unscopedChatCount}
              </small>
            </div>
            {isChatView && expanded.has("unscoped") ? (
              <div className="project-rail-chats">
                {renderSessions(
                  model.unscopedSessions,
                  "unscoped",
                  model.unscopedChatCount,
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
