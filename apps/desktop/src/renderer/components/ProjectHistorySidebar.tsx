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
  buildProjectSidebarModel,
  conversationLabel,
} from "./project-sidebar-model";
import "./project-sidebar.css";

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
      isChatView &&
      activeScope === scope &&
      Boolean(selectedSessionId) &&
      !sessions.some((session) => session.sessionId === selectedSessionId);
    const draft = hasCurrentDraft ? (
      <button
        aria-current="true"
        className="project-rail-chat is-selected"
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
            className="project-rail-empty"
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
          const selected =
            isChatView && selectedSessionId === session.sessionId;
          const pinned = Boolean(pinnedSessions[session.sessionId]);
          return (
            <div
              className={`project-rail-chat-row ${selected ? "is-selected" : ""} ${pinned ? "is-pinned" : ""}`}
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
                aria-label={`${pinned ? "Unpin" : "Pin"} ${conversationLabel(session)}`}
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

  const group = (
    project: ProjectLike,
    chats: readonly SessionSummary[],
    chatCount: number,
  ) => {
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
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.name} chats`}
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
  };

  return (
    <section
      aria-labelledby="sidebar-projects"
      className={`sidebar-projects ${isChatView ? "" : "sidebar-projects--workspace"}`}
    >
      <div className="sidebar-projects__heading">
        <span id="sidebar-projects">
          Projects<small>{model.projects.length}</small>
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
        className={`project-rail-all ${activeScope === "all" ? "is-active" : ""}`}
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
        {model.projects.map(({ project, sessions: chats, chatCount }) =>
          group(project, chats, chatCount),
        )}
        {!model.projects.length ? (
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
            className={`project-rail-group project-rail-group--general ${activeScope === "unscoped" ? "is-active" : ""}`}
          >
            <div className="project-rail-row">
              <button
                aria-expanded={expanded.has("unscoped")}
                aria-label={`${expanded.has("unscoped") ? "Collapse" : "Expand"} general chats`}
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
