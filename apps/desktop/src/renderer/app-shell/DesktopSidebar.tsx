import type { BotSummary } from "@doolittle/contracts/bots";
import { StateSurface } from "@doolittle/ui";
import {
  AlertCircle,
  CalendarClock,
  Files,
  ListTodo,
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DoolittleDesktopBridge,
  SessionSummary,
} from "../../shared/contracts";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UiIcon } from "../components/UiIcon";
import { desktopWorkspaceArea, type View } from "../desktop-navigation";
import { APP_SIDEBAR_WIDTH } from "../panel-layout";
import type { ProjectScope } from "../project-manager/models";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { ChatProjectFilter, ChatScopePicker } from "./ChatSidebarControls";
import {
  APP_SIDEBAR_CLASS,
  APP_SIDEBAR_COLLAPSED_CLASS,
  APP_SIDEBAR_DARWIN_CLASS,
  APP_SIDEBAR_DESKTOP_CLASS,
  APP_SIDEBAR_MOBILE_CLASS,
  APP_SIDEBAR_MOBILE_CLOSED_CLASS,
  APP_SIDEBAR_MOBILE_OPEN_CLASS,
  SIDEBAR_SCRIM_CLASS,
  SIDEBAR_SCRIM_HIDDEN_CLASS,
  SIDEBAR_SCRIM_VISIBLE_CLASS,
} from "./shell-layout";

type BotCatalogStatus =
  | "disabled"
  | "loading"
  | "ready"
  | "refreshing"
  | "error";

export interface DesktopSidebarProps {
  isMobileSidebarMode: boolean;
  mobileSidebarOpen: boolean;
  navCollapsed: boolean;
  sidebarWidth: number;
  chatScope: "bot" | "groups";
  selectedBotId: string;
  bots: readonly BotSummary[];
  botStatus: BotCatalogStatus;
  botError: string;
  sessions: readonly SessionSummary[];
  selectedSession: string;
  projects: readonly {
    id: string;
    name: string;
    color?: string | null;
    archivedAt?: string | null;
  }[];
  platform: DoolittleDesktopBridge["platform"];
  sidebarRef: RefObject<HTMLElement | null>;
  onSidebarKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onClose: () => void;
  onResize: (width: number) => void;
  resizeBounds?: { default: number; min: number; max: number };
  onResizeActiveChange?: (active: boolean) => void;
  onToggleNavigation: () => void;
  onOpenPalette: () => void;
  onStartConversation: (scope: ProjectScope) => void;
  onOpenSession: (sessionId: string) => void;
  onSelectBot: (botId: string) => void;
  onSelectGroups: () => void;
  onAddBot: () => void;
  onRetryBots: () => void;
  onSetView: (view: View) => void;
  navigationView: View;
}

const SIDEBAR_ACTION_CLASS =
  "flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-current:bg-[var(--surface-hover)] aria-current:font-semibold aria-current:text-[var(--text)] disabled:cursor-default disabled:opacity-50 max-[760px]:min-h-11";

export function DesktopSidebar({
  isMobileSidebarMode,
  mobileSidebarOpen,
  navCollapsed,
  sidebarWidth,
  chatScope,
  selectedBotId,
  bots,
  botStatus,
  botError,
  sessions,
  selectedSession,
  projects,
  platform,
  sidebarRef,
  onSidebarKeyDown,
  onClose,
  onResize,
  resizeBounds = APP_SIDEBAR_WIDTH,
  onResizeActiveChange,
  onToggleNavigation,
  onOpenPalette,
  onStartConversation,
  onOpenSession,
  onSelectBot,
  onSelectGroups,
  onAddBot,
  onRetryBots,
  onSetView,
  navigationView,
}: DesktopSidebarProps) {
  const area = desktopWorkspaceArea(navigationView);
  const compact = navCollapsed && !isMobileSidebarMode;
  const sidebarAction = `${SIDEBAR_ACTION_CLASS}${compact ? " justify-center" : ""}`;
  const scopePickerRef = useRef<HTMLButtonElement>(null);
  const showingGroups = chatScope === "groups";
  const selectedBot = bots.find((bot) => bot.id === selectedBotId);
  const canStartConversation = !showingGroups && Boolean(selectedBot);
  const canManageBots = botStatus === "ready" || botStatus === "refreshing";
  const [projectFilter, setProjectFilter] = useState<ProjectScope>("all");
  const projectOptions = useMemo(() => {
    const historyProjects = new Map<string, string>();
    for (const { projectId, projectContext } of sessions) {
      if (projectId) historyProjects.set(projectId, projectContext?.name ?? "");
    }
    const options = projects.filter(
      ({ id, archivedAt }) => !archivedAt || historyProjects.has(id),
    );
    const known = new Set(options.map(({ id }) => id));
    for (const [id, name] of historyProjects) {
      if (name && !known.has(id)) options.push({ id, name });
    }
    return options.sort((left, right) => left.name.localeCompare(right.name));
  }, [projects, sessions]);
  const activeFilter =
    projectFilter === "unscoped" ||
    projectOptions.some(({ id }) => id === projectFilter)
      ? projectFilter
      : "all";
  const filteredSessions = useMemo(
    () =>
      activeFilter === "all"
        ? sessions
        : sessions.filter(({ projectId }) =>
            activeFilter === "unscoped"
              ? !projectId
              : projectId === activeFilter,
          ),
    [activeFilter, sessions],
  );

  return (
    <>
      <button
        aria-hidden="true"
        className={`${SIDEBAR_SCRIM_CLASS} ${mobileSidebarOpen ? SIDEBAR_SCRIM_VISIBLE_CLASS : SIDEBAR_SCRIM_HIDDEN_CLASS}`}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        id="desktop-sidebar"
        {...(mobileSidebarOpen
          ? { "aria-modal": true as const, role: "dialog" as const }
          : {})}
        aria-hidden={
          isMobileSidebarMode && !mobileSidebarOpen ? true : undefined
        }
        inert={isMobileSidebarMode && !mobileSidebarOpen}
        aria-label="Navigation and bots"
        className={`${APP_SIDEBAR_CLASS}${platform === "darwin" ? ` ${APP_SIDEBAR_DARWIN_CLASS}` : ""} ${isMobileSidebarMode ? `${APP_SIDEBAR_MOBILE_CLASS} ${mobileSidebarOpen ? APP_SIDEBAR_MOBILE_OPEN_CLASS : APP_SIDEBAR_MOBILE_CLOSED_CLASS}` : APP_SIDEBAR_DESKTOP_CLASS}${compact ? ` ${APP_SIDEBAR_COLLAPSED_CLASS}` : ""}`}
        onKeyDown={onSidebarKeyDown}
        ref={sidebarRef}
      >
        {!compact && !isMobileSidebarMode ? (
          <PanelResizeHandle
            bounds={resizeBounds}
            className="app-sidebar-resizer inset-y-0 right-0"
            controls="desktop-sidebar"
            direction="grow-right"
            label="Resize bot navigation"
            onResize={onResize}
            onResizeActiveChange={onResizeActiveChange}
            value={sidebarWidth}
          />
        ) : null}
        <div
          className={`flex min-h-14 shrink-0 items-center gap-2 px-2 [-webkit-app-region:no-drag] ${compact ? "flex-col px-0 py-2" : ""}`}
        >
          <button
            aria-current={navigationView === "dashboard" ? "page" : undefined}
            aria-label="Doolittle home"
            className="grid size-8 place-items-center rounded-[var(--radius-md)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
            onClick={() => onSetView("dashboard")}
            type="button"
          >
            D
          </button>
          {!compact ? (
            <strong className="min-w-0 flex-1 truncate text-sm font-semibold">
              Doolittle
            </strong>
          ) : null}
          <button
            aria-label={
              isMobileSidebarMode
                ? "Close navigation"
                : compact
                  ? "Expand navigation"
                  : "Collapse navigation"
            }
            className="grid size-10 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
            onClick={isMobileSidebarMode ? onClose : onToggleNavigation}
            type="button"
          >
            <UiIcon
              icon={
                isMobileSidebarMode
                  ? X
                  : compact
                    ? PanelLeftOpen
                    : PanelLeftClose
              }
              size="sm"
            />
          </button>
        </div>
        {compact ? (
          <div className="grid shrink-0 gap-1 px-1 pb-3 [-webkit-app-region:no-drag]">
            <button
              className={sidebarAction}
              onClick={onOpenPalette}
              title="Search"
              type="button"
            >
              <UiIcon icon={Search} />
              <span className="sr-only">Search</span>
            </button>
            <button
              aria-controls="desktop-sidebar"
              aria-expanded={false}
              className={sidebarAction}
              onClick={() => {
                onToggleNavigation();
                requestAnimationFrame(() => scopePickerRef.current?.focus());
              }}
              title="Show chats"
              type="button"
            >
              <UiIcon icon={showingGroups ? Users : MessageSquare} />
              <span className="sr-only">Show chats</span>
            </button>
            <button
              className={sidebarAction}
              disabled={!canStartConversation}
              onClick={() => onStartConversation(activeFilter)}
              title="New conversation"
              type="button"
            >
              <UiIcon icon={Plus} />
              <span className="sr-only">New conversation</span>
            </button>
          </div>
        ) : (
          <div className="chat-sidebar-controls">
            <ChatScopePicker
              bots={bots}
              selectedBotId={selectedBotId}
              showingGroups={showingGroups}
              canManageBots={canManageBots}
              onSelectBot={onSelectBot}
              onSelectGroups={onSelectGroups}
              onAddBot={onAddBot}
              onManageBots={() => onSetView("agents")}
              triggerRef={scopePickerRef}
            />
            <div className="chat-sidebar-primary-actions">
              <button
                className="chat-sidebar-new"
                disabled={!canStartConversation}
                onClick={() => onStartConversation(activeFilter)}
                type="button"
              >
                <UiIcon icon={Plus} />
                <span className="truncate">New conversation</span>
              </button>
              <button
                aria-label="Search"
                className="chat-sidebar-search"
                onClick={onOpenPalette}
                title="Search"
                type="button"
              >
                <UiIcon icon={Search} />
              </button>
            </div>
            <ChatProjectFilter
              onChange={setProjectFilter}
              projects={projectOptions}
              value={activeFilter}
            />
          </div>
        )}
        <nav
          aria-label="Chat history"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 [-webkit-app-region:no-drag]"
        >
          {compact && botStatus === "error" ? (
            <button
              className={`${sidebarAction} mx-auto`}
              onClick={onRetryBots}
              title="Could not load bots. Retry"
              type="button"
            >
              <UiIcon icon={AlertCircle} size="sm" />
              <span className="sr-only">Could not load bots. Retry</span>
            </button>
          ) : null}
          {compact && (botStatus === "disabled" || botStatus === "loading") ? (
            <div
              className="grid min-h-10 place-items-center text-[var(--muted)]"
              role="status"
              title={
                botStatus === "disabled" ? "Runtime offline" : "Loading bots"
              }
            >
              <UiIcon
                icon={botStatus === "disabled" ? WifiOff : LoaderCircle}
                size="sm"
              />
              <span className="sr-only">
                {botStatus === "disabled" ? "Runtime offline" : "Loading bots"}
              </span>
            </div>
          ) : null}
          {!compact &&
          bots.length > 0 &&
          (botStatus === "error" || botStatus === "disabled") ? (
            <div
              className="px-3 py-2 text-xs leading-5 text-[var(--muted)]"
              role="status"
            >
              {botStatus === "disabled"
                ? "Runtime offline. Saved bots remain available."
                : "Could not update bots. Showing the last catalog."}
              {botStatus === "error" ? (
                <button
                  className="ml-1 min-h-10 underline"
                  onClick={onRetryBots}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {!compact &&
          bots.length === 0 &&
          (botStatus === "loading" || botStatus === "disabled") ? (
            <StateSurface
              kind={botStatus === "disabled" ? "offline" : "loading"}
              title={
                botStatus === "disabled" ? "Runtime offline" : "Loading bots"
              }
            />
          ) : !compact && botStatus === "error" && bots.length === 0 ? (
            <StateSurface
              action={
                <button
                  className="text-sm underline"
                  onClick={onRetryBots}
                  type="button"
                >
                  Retry
                </button>
              }
              kind="error"
              title="Bots unavailable"
            >
              {botError}
            </StateSurface>
          ) : !compact && !showingGroups && bots.length === 0 ? (
            <StateSurface kind="empty" title="No bots available">
              The local runtime has not returned a bot catalog.
            </StateSurface>
          ) : null}
          {!compact && (showingGroups || selectedBot || sessions.length > 0) ? (
            <>
              <ChatHistorySidebar
                filtered={activeFilter !== "all"}
                onOpenSession={onOpenSession}
                projects={projects}
                selectedSession={
                  navigationView === "chat" ? selectedSession : undefined
                }
                sessions={filteredSessions}
                showingGroups={showingGroups}
              />
              {!showingGroups ? (
                <button
                  aria-current={
                    navigationView === "sessions" ? "page" : undefined
                  }
                  className="min-h-9 w-full rounded-[var(--radius-md)] px-2 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-current:font-semibold aria-current:text-[var(--text)] max-[760px]:min-h-11"
                  onClick={() => onSetView("sessions")}
                  type="button"
                >
                  All conversations
                </button>
              ) : null}
            </>
          ) : null}
        </nav>
        <nav
          aria-label="Workspace navigation"
          className="grid shrink-0 gap-1 border-t border-[var(--border)] px-1 py-2 [-webkit-app-region:no-drag]"
        >
          {(
            [
              ["code", "Workspace", Files],
              ["orchestration", "Work", ListTodo],
              ["automations", "Automations", CalendarClock],
              ["settings", "Settings", Settings],
            ] as const
          ).map(([target, label, icon]) => (
            <button
              aria-current={area === target ? "page" : undefined}
              className={sidebarAction}
              key={target}
              onClick={() => onSetView(target)}
              type="button"
              title={compact ? label : undefined}
            >
              <UiIcon icon={icon} size="sm" />
              <span className={compact ? "sr-only" : ""}>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
