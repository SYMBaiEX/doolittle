import {
  ChevronRight,
  FolderPlus,
  History,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SessionSummary } from "../../shared/contracts";
import {
  CONVERSATION_PINS_EVENT,
  loadConversationPins,
  saveConversationPins,
} from "../conversation-persistence";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import { ProjectMark, projectLocationLabel } from "./ProjectSidebarControls";
import {
  PROJECT_RAIL_ACTIVE_CLASS,
  PROJECT_RAIL_ALL_CLASS,
  PROJECT_RAIL_CHAT_CLASS,
  PROJECT_RAIL_CHAT_SELECTED_CLASS,
  PROJECT_RAIL_GROUP_ACTIVE_CLASS,
  PROJECT_RAIL_GROUP_CLASS,
  PROJECT_RAIL_MAIN_CLASS,
  PROJECT_RAIL_ROW_CLASS,
  SIDEBAR_PROJECTS_CLASS,
  SIDEBAR_PROJECTS_HEADING_CLASS,
} from "./project-sidebar-layout";
import {
  buildProjectSidebarModel,
  conversationLabel,
} from "./project-sidebar-model";
import { UiIcon } from "./UiIcon";

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

export interface ProjectHistorySidebarProps {
  projects: readonly ProjectLike[];
  sessions: readonly SessionSummary[];
  activeScope: ProjectScope;
  selectedSessionId: string;
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
    if (activeScope !== "all" && activeScope !== "unscoped")
      initial.push(activeScope);
    return new Set(initial);
  });

  useEffect(() => {
    if (activeScope === "all") return;
    setExpanded((current) =>
      current.has(activeScope) ? current : new Set([...current, activeScope]),
    );
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
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const renderSessions = (
    entries: readonly SessionSummary[],
    scope: ProjectScope,
    chatCount: number,
  ) => {
    const hasCurrentDraft =
      activeScope === scope &&
      Boolean(selectedSessionId) &&
      !sessions.some((session) => session.sessionId === selectedSessionId);
    const draft = hasCurrentDraft ? (
      <button
        aria-current="true"
        className={`${PROJECT_RAIL_CHAT_CLASS} ${PROJECT_RAIL_CHAT_SELECTED_CLASS}`}
        onClick={() => onOpenSession(selectedSessionId)}
        type="button"
      >
        <i aria-hidden="true" />
        <span>Current draft</span>
      </button>
    ) : null;
    if (!entries.length)
      return (
        draft ?? (
          <button
            className="project-rail-empty min-h-6.25 rounded-[var(--radius-xs)] py-0.75 pr-1.75 pl-5.5 text-left font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] [.desktop-shell.nav-collapsed_&]:hidden"
            onClick={() => onStartConversation(scope)}
            type="button"
          >
            Start the first chat
          </button>
        )
      );
    return (
      <>
        {draft}
        {entries.map((session) => {
          const selected = selectedSessionId === session.sessionId;
          const pinned = Boolean(pinnedSessions[session.sessionId]);
          return (
            <div
              className={`project-rail-chat-row group/chat grid grid-cols-[minmax(0,1fr)_23px] items-center ${selected ? "is-selected" : ""} ${pinned ? "is-pinned" : ""}`}
              key={session.sessionId}
            >
              <button
                aria-current={selected ? "true" : undefined}
                className={`${PROJECT_RAIL_CHAT_CLASS} ${selected ? PROJECT_RAIL_CHAT_SELECTED_CLASS : ""}`}
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
                aria-label={`${pinned ? "Unpin" : "Pin"} ${conversationLabel(session)}`}
                aria-pressed={pinned}
                className={`project-rail-chat-pin grid size-5.5 place-items-center rounded-[var(--radius-xs)] p-0 text-[var(--faint)] opacity-0 hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-soft))] hover:text-[var(--accent)] focus-visible:opacity-100 group-hover/chat:opacity-100 ${pinned ? "text-[var(--accent)] opacity-100" : ""}`}
                onClick={() => togglePinnedSession(session.sessionId)}
                title={pinned ? "Unpin conversation" : "Pin conversation"}
                type="button"
              >
                <UiIcon
                  className={pinned ? "fill-current" : ""}
                  icon={Pin}
                  size="xs"
                />
              </button>
            </div>
          );
        })}
        {chatCount > entries.length ? (
          <button
            className="project-rail-more min-h-6.25 rounded-[var(--radius-xs)] py-0.75 pr-1.75 pl-5.5 text-left font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] [.desktop-shell.nav-collapsed_&]:hidden"
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

  const group = (
    project: ProjectLike,
    chats: readonly SessionSummary[],
    chatCount: number,
  ) => {
    const isExpanded = expanded.has(project.id);
    const isActive = activeScope === project.id;
    return (
      <div
        className={`${PROJECT_RAIL_GROUP_CLASS} ${isActive ? PROJECT_RAIL_GROUP_ACTIVE_CLASS : ""}`}
        key={project.id}
      >
        <div
          className={`${PROJECT_RAIL_ROW_CLASS} ${isActive ? "bg-[color-mix(in_srgb,var(--surface-hover)_76%,transparent)] text-[var(--text)]" : ""}`}
        >
          <button
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.name} chats`}
            className="project-rail-disclosure grid h-6 w-4.25 place-items-center p-0 text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:hidden [&>svg]:transition-transform [&>svg]:duration-120 motion-reduce:[&>svg]:transition-none aria-expanded:[&>svg]:rotate-90"
            onClick={() => toggleExpanded(project.id)}
            type="button"
          >
            <UiIcon icon={ChevronRight} size="xs" />
          </button>
          <button
            className={PROJECT_RAIL_MAIN_CLASS}
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
            className="project-rail-new grid size-5.5 place-items-center rounded-[var(--radius-xs)] p-0 text-[var(--muted)] opacity-0 hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-soft))] hover:text-[var(--accent)] focus-visible:opacity-100 [.project-rail-row:hover_&]:opacity-100 [.desktop-shell.nav-collapsed_&]:hidden"
            onClick={() => onStartConversation(project.id)}
            title={`New chat in ${project.name}`}
            type="button"
          >
            <UiIcon icon={Plus} size="xs" />
          </button>
          <small className="project-rail-count font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:hidden">
            {chatCount}
          </small>
        </div>
        {isExpanded ? (
          <div className="project-rail-chats grid gap-px pt-0.75 pb-1.5 pl-8 [.desktop-shell.nav-collapsed_&]:hidden">
            {renderSessions(chats, project.id, chatCount)}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="sidebar-projects"
      className={SIDEBAR_PROJECTS_CLASS}
    >
      <div className={SIDEBAR_PROJECTS_HEADING_CLASS}>
        <span id="sidebar-projects">
          Projects<small>{model.projects.length}</small>
        </span>
        <div>
          <button
            className="grid size-6.5 place-items-center rounded-[var(--radius-xs)] border border-transparent p-0 text-sm text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-label="Choose a repository"
            onClick={() => void onChooseRepository()}
            title="Choose a repository"
            type="button"
          >
            <UiIcon icon={Plus} size="sm" />
          </button>
          <button
            className="grid size-6.5 place-items-center rounded-[var(--radius-xs)] border border-transparent p-0 text-sm text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] [&>span]:text-[length:var(--text-meta)] [&>span]:tracking-[-0.16em]"
            aria-label="Manage projects"
            onClick={onManageProjects}
            title="Manage projects"
            type="button"
          >
            <UiIcon icon={MoreHorizontal} size="sm" />
          </button>
        </div>
      </div>
      <button
        aria-current={activeScope === "all" ? "page" : undefined}
        className={`${PROJECT_RAIL_ALL_CLASS} ${activeScope === "all" ? PROJECT_RAIL_ACTIVE_CLASS : ""}`}
        onClick={() => onSelectScope("all")}
        title="All conversations"
        type="button"
      >
        <UiIcon icon={History} size="sm" />
        <span>
          <strong>All conversations</strong>
          <em>Browse recent and pinned chats</em>
        </span>
        <small>{sessions.length}</small>
      </button>
      <div className="sidebar-projects__list grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto pr-0.5 [overscroll-behavior:contain] [scrollbar-gutter:stable] [.desktop-shell.nav-collapsed_&]:pr-0 [.desktop-shell.nav-collapsed_&]:[scrollbar-width:none]">
        {model.projects.map(({ project, sessions: chats, chatCount }) =>
          group(project, chats, chatCount),
        )}
        {!model.projects.length ? (
          <button
            className="project-rail-onboarding mt-0.75 grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-px rounded-[var(--radius-sm)] border border-dashed border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-soft))] px-2 py-2.25 text-left text-[var(--text-soft)] [.desktop-shell.nav-collapsed_&]:min-h-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:justify-items-center [.desktop-shell.nav-collapsed_&]:gap-0 [.desktop-shell.nav-collapsed_&]:px-1 [&>svg]:row-span-2 [&>svg]:text-[var(--accent)] [&>strong]:text-[11px] [.desktop-shell.nav-collapsed_&]:[&>strong]:hidden [&>small]:text-[length:var(--text-meta)] [&>small]:text-[var(--muted)] [.desktop-shell.nav-collapsed_&]:[&>small]:hidden"
            onClick={() => void onChooseRepository()}
            type="button"
          >
            <UiIcon icon={FolderPlus} size="lg" />
            <strong>Add your first repository</strong>
            <small>Projects keep chats and code together.</small>
          </button>
        ) : null}
        {model.unscopedChatCount > 0 || activeScope === "unscoped" ? (
          <div
            className={`${PROJECT_RAIL_GROUP_CLASS} project-rail-group--general ${activeScope === "unscoped" ? PROJECT_RAIL_GROUP_ACTIVE_CLASS : ""}`}
          >
            <div
              className={`${PROJECT_RAIL_ROW_CLASS} ${activeScope === "unscoped" ? "bg-[color-mix(in_srgb,var(--surface-hover)_76%,transparent)] text-[var(--text)]" : ""}`}
            >
              <button
                aria-expanded={expanded.has("unscoped")}
                aria-label={`${expanded.has("unscoped") ? "Collapse" : "Expand"} general chats`}
                className="project-rail-disclosure grid h-6 w-4.25 place-items-center p-0 text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:hidden [&>svg]:transition-transform [&>svg]:duration-120 motion-reduce:[&>svg]:transition-none aria-expanded:[&>svg]:rotate-90"
                onClick={() => toggleExpanded("unscoped")}
                type="button"
              >
                <UiIcon icon={ChevronRight} size="xs" />
              </button>
              <button
                className={PROJECT_RAIL_MAIN_CLASS}
                onClick={() => onSelectScope("unscoped")}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="project-rail-general-mark grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] font-[var(--font-mono)] text-[10px] font-bold text-[var(--muted)] [.desktop-shell.nav-collapsed_&]:size-6.5 [.desktop-shell.nav-collapsed_&]:rounded-[7px]"
                >
                  <UiIcon icon={MessageCircle} size="sm" />
                </span>
                <span>
                  <strong>General</strong>
                  <small>No repository</small>
                </span>
              </button>
              <button
                aria-label="New general chat"
                className="project-rail-new grid size-5.5 place-items-center rounded-[var(--radius-xs)] p-0 text-[var(--muted)] opacity-0 hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-soft))] hover:text-[var(--accent)] focus-visible:opacity-100 [.project-rail-row:hover_&]:opacity-100 [.desktop-shell.nav-collapsed_&]:hidden"
                onClick={() => onStartConversation("unscoped")}
                title="New general chat"
                type="button"
              >
                <UiIcon icon={Plus} size="xs" />
              </button>
              <small className="project-rail-count font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:hidden">
                {model.unscopedChatCount}
              </small>
            </div>
            {expanded.has("unscoped") ? (
              <div className="project-rail-chats grid gap-px pt-0.75 pb-1.5 pl-8 [.desktop-shell.nav-collapsed_&]:hidden">
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
