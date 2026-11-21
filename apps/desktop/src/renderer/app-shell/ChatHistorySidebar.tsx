import { ContextActionMenu } from "@doolittle/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@elizaos/ui/components/ui/tooltip";
import {
  ChevronRight,
  Clock3,
  Folder,
  FolderOpen,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  Pin,
} from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SessionSummary } from "../../shared/contracts";
import { useConversationPins } from "../chat/useConversationPins";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import {
  type ConversationPins,
  safeSetStorageItem,
} from "../conversation-persistence";
import "./chat-history-sidebar.css";

export interface ChatHistoryProject {
  id: string;
  name: string;
  archivedAt?: string | null;
}

interface ChatHistorySidebarProps {
  sessions: readonly SessionSummary[];
  projects: readonly ChatHistoryProject[];
  selectedSession?: string;
  showingGroups: boolean;
  filtered: boolean;
  onOpenSession: (sessionId: string) => void;
}

interface ChatHistoryProjectGroup {
  id: string;
  name: string;
  archived: boolean;
  sessions: SessionSummary[];
}

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const COLLAPSE_STORAGE_KEY = "doolittle.desktop.chat-history.collapsed.v1";
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function loadCollapsed(): Set<string> {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? "[]",
    );
    if (Array.isArray(stored))
      return new Set(
        stored
          .filter(
            (key): key is string =>
              typeof key === "string" && key.length <= 512,
          )
          .slice(0, 500),
      );
  } catch {
    // Collapsing remains available for the current window.
  }
  return new Set();
}

function activityTime(session: SessionSummary): number {
  for (const value of [session.endedAt, session.startedAt]) {
    const time = Date.parse(value ?? "");
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function projectName(
  session: SessionSummary,
  projects: ReadonlyMap<string, ChatHistoryProject>,
): string {
  return session.projectId
    ? (projects.get(session.projectId)?.name ??
        session.projectContext?.name ??
        "Unavailable project")
    : "General";
}

function partitionHistory(
  sessions: readonly SessionSummary[],
  projects: ReadonlyMap<string, ChatHistoryProject>,
  pins: ConversationPins,
  now: number,
) {
  const sorted = sessions
    .map((session) => ({ session, time: activityTime(session) }))
    .sort((left, right) => right.time - left.time);
  const pinned: SessionSummary[] = [];
  const recent: SessionSummary[] = [];
  const general: SessionSummary[] = [];
  const projectGroups = new Map<string, ChatHistoryProjectGroup>();
  const seen = new Set<string>();

  for (const { session, time } of sorted) {
    if (seen.has(session.sessionId)) continue;
    seen.add(session.sessionId);
    if (pins[session.sessionId] === true) {
      pinned.push(session);
    } else if (session.projectId) {
      let group = projectGroups.get(session.projectId);
      if (!group) {
        group = {
          id: session.projectId,
          name: projectName(session, projects),
          archived: Boolean(projects.get(session.projectId)?.archivedAt),
          sessions: [],
        };
        projectGroups.set(session.projectId, group);
      }
      group.sessions.push(session);
    } else if (time >= now - RECENT_WINDOW_MS) {
      recent.push(session);
    } else {
      general.push(session);
    }
  }

  const sortedProjects = [...projectGroups.values()].sort(
    (left, right) =>
      Number(left.archived) - Number(right.archived) ||
      left.name.localeCompare(right.name),
  );
  return { pinned, projects: sortedProjects, recent, general, now };
}

function HistoryDisclosure({
  title,
  count,
  open,
  current,
  icon,
  nested = false,
  archived = false,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  current: boolean;
  icon: ComponentProps<typeof UiIcon>["icon"];
  nested?: boolean;
  archived?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  const Container = nested ? "div" : "section";
  return (
    <Container
      aria-label={nested ? undefined : title}
      className={nested ? "chat-history-project" : "chat-history-section"}
    >
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        aria-label={title}
        className="chat-history-disclosure"
        data-contains-current={current || undefined}
        onClick={onToggle}
        type="button"
      >
        <UiIcon icon={icon} size="xs" />
        <span className="chat-history-disclosure-title">{title}</span>
        {archived ? (
          <span className="chat-history-archived">Archived</span>
        ) : null}
        {count > 0 ? (
          <span className="chat-history-count" aria-hidden>
            {count}
          </span>
        ) : null}
        <UiIcon
          className="chat-history-chevron"
          icon={ChevronRight}
          size="xs"
        />
      </button>
      <div className="chat-history-body" hidden={!open} id={bodyId}>
        {open ? children : null}
      </div>
    </Container>
  );
}

function ChatHistoryRow({
  session,
  project,
  current,
  pinned,
  open,
  togglePin,
  register,
}: {
  session: SessionSummary;
  project: string;
  current: boolean;
  pinned: boolean;
  open: () => void;
  togglePin: () => void;
  register: (element: HTMLButtonElement | null) => void;
}) {
  const title = session.title?.trim() || "Conversation";
  const activeAt = activityTime(session);
  return (
    <ContextActionMenu
      className="chat-history-row"
      items={[
        {
          id: "open",
          label: "Open conversation",
          onSelect: open,
        },
        {
          id: "pin",
          label: pinned ? "Unpin conversation" : "Pin conversation",
          onSelect: togglePin,
        },
        {
          id: "copy-title",
          label: "Copy conversation title",
          disabled: !session.title?.trim(),
          separatorBefore: true,
          onSelect: () => void copyContextText(title),
        },
        {
          id: "copy-id",
          label: "Copy conversation ID",
          onSelect: () => void copyContextText(session.sessionId),
        },
      ]}
      label={`${title} actions`}
      scopeKey={`conversation:${session.sessionId}`}
      trigger={
        <button
          className="chat-history-row-actions"
          type="button"
          aria-label={`${title} actions`}
        >
          <UiIcon icon={MoreHorizontal} size="sm" />
        </button>
      }
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-current={current ? "page" : undefined}
            className="chat-history-row-open"
            onClick={open}
            ref={register}
            type="button"
          >
            <UiIcon
              icon={
                pinned
                  ? Pin
                  : session.conversationKind === "group"
                    ? MessagesSquare
                    : MessageSquare
              }
              size="xs"
            />
            <span className="chat-history-row-title">{title}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="chat-history-tooltip"
          collisionPadding={12}
          side="right"
          sideOffset={34}
        >
          <span className="chat-history-tooltip-title">{title}</span>
          <span className="chat-history-tooltip-detail">
            <UiIcon icon={Folder} size="xs" />
            <span>{project}</span>
          </span>
          {activeAt ? (
            <span className="chat-history-tooltip-detail">
              <UiIcon icon={Clock3} size="xs" />
              <time dateTime={new Date(activeAt).toISOString()}>
                {dateFormatter.format(activeAt)}
              </time>
            </span>
          ) : null}
          <span className="chat-history-tooltip-meta">
            {session.messageCount}{" "}
            {session.messageCount === 1 ? "message" : "messages"}
            {session.readOnly || session.conversationKind === "group"
              ? " · Read-only"
              : ""}
          </span>
        </TooltipContent>
      </Tooltip>
    </ContextActionMenu>
  );
}

export function ChatHistorySidebar({
  sessions,
  projects,
  selectedSession,
  showingGroups,
  filtered,
  onOpenSession,
}: ChatHistorySidebarProps) {
  const { pinnedSessions, togglePin } = useConversationPins();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const pendingFocus = useRef<string>(undefined);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const history = useMemo(
    () => partitionHistory(sessions, projectById, pinnedSessions, Date.now()),
    [sessions, projectById, pinnedSessions],
  );

  useLayoutEffect(() => {
    const sessionId = pendingFocus.current;
    if (sessionId === undefined) return;
    pendingFocus.current = undefined;
    rowButtons.current.get(sessionId)?.focus({ preventScroll: true });
  });

  function updateCollapsed(next: Set<string>) {
    setCollapsed(next);
    safeSetStorageItem(
      localStorage,
      COLLAPSE_STORAGE_KEY,
      JSON.stringify([...next]),
    );
  }

  function toggleSection(key: string) {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    updateCollapsed(next);
  }

  function movePin(session: SessionSummary, pinned: boolean) {
    const next = new Set(collapsed);
    if (!pinned) {
      next.delete("pinned");
    } else if (session.projectId) {
      next.delete("projects");
      next.delete(`project:${session.projectId}`);
    } else {
      next.delete(
        activityTime(session) >= history.now - RECENT_WINDOW_MS
          ? "recent"
          : "general",
      );
    }
    updateCollapsed(next);
    pendingFocus.current = session.sessionId;
    togglePin(session.sessionId);
  }

  const hasCurrent = (rows: readonly SessionSummary[]) =>
    rows.some((session) => session.sessionId === selectedSession);
  const renderRows = (rows: readonly SessionSummary[], pinned = false) =>
    rows.map((session) => (
      <ChatHistoryRow
        current={session.sessionId === selectedSession}
        key={session.sessionId}
        open={() => onOpenSession(session.sessionId)}
        pinned={pinned}
        project={projectName(session, projectById)}
        register={(element) => {
          if (element) rowButtons.current.set(session.sessionId, element);
          else rowButtons.current.delete(session.sessionId);
        }}
        session={session}
        togglePin={() => movePin(session, pinned)}
      />
    ));

  return (
    <section
      aria-label={showingGroups ? "Group chats" : "Conversation sections"}
      className="chat-history"
    >
      <TooltipProvider delayDuration={420} skipDelayDuration={160}>
        <HistoryDisclosure
          count={history.pinned.length}
          current={hasCurrent(history.pinned)}
          icon={Pin}
          onToggle={() => toggleSection("pinned")}
          open={!collapsed.has("pinned")}
          title="Pinned"
        >
          {renderRows(history.pinned, true)}
        </HistoryDisclosure>
        <HistoryDisclosure
          count={history.projects.length}
          current={history.projects.some((project) =>
            hasCurrent(project.sessions),
          )}
          icon={Folder}
          onToggle={() => toggleSection("projects")}
          open={!collapsed.has("projects")}
          title="Projects"
        >
          {history.projects.map((project) => {
            const key = `project:${project.id}`;
            const open = !collapsed.has(key);
            return (
              <HistoryDisclosure
                archived={project.archived}
                count={project.sessions.length}
                current={hasCurrent(project.sessions)}
                icon={open ? FolderOpen : Folder}
                key={project.id}
                nested
                onToggle={() => toggleSection(key)}
                open={open}
                title={project.name}
              >
                {renderRows(project.sessions)}
              </HistoryDisclosure>
            );
          })}
        </HistoryDisclosure>
        <HistoryDisclosure
          count={history.recent.length}
          current={hasCurrent(history.recent)}
          icon={Clock3}
          onToggle={() => toggleSection("recent")}
          open={!collapsed.has("recent")}
          title="Recent"
        >
          {renderRows(history.recent)}
        </HistoryDisclosure>
        <HistoryDisclosure
          count={history.general.length}
          current={hasCurrent(history.general)}
          icon={MessageSquare}
          onToggle={() => toggleSection("general")}
          open={!collapsed.has("general")}
          title="General"
        >
          {renderRows(history.general)}
        </HistoryDisclosure>
        {sessions.length === 0 ? (
          <p className="chat-history-empty">
            {filtered
              ? "No chats match this project."
              : showingGroups
                ? "No group chats yet."
                : "No conversations yet."}
          </p>
        ) : null}
      </TooltipProvider>
    </section>
  );
}
