import type { BotSummary } from "@doolittle/contracts/bots";
import {
  ContextActionMenu,
  NativeSelect,
  RunState,
  StateSurface,
} from "@doolittle/ui";
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  Files,
  ListTodo,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
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
} from "react";
import type {
  DoolittleDesktopBridge,
  SessionSummary,
} from "../../shared/contracts";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import { desktopWorkspaceArea, type View } from "../desktop-navigation";
import { APP_SIDEBAR_WIDTH } from "../panel-layout";
import type { ProjectScope } from "../project-manager/models";
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
  projectScope: ProjectScope;
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

function botRunState(bot: BotSummary) {
  if (bot.state === "error") return "error" as const;
  if (bot.state === "waiting") return "waiting" as const;
  if (bot.activeRunCount > 0 || bot.state === "busy") return "running" as const;
  return undefined;
}

const ROW_MENU_TRIGGER_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] max-[760px]:size-11 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

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
  projectScope,
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
  const scopePickerRef = useRef<HTMLSelectElement>(null);
  const showingGroups = chatScope === "groups";
  const selectedBot = bots.find((bot) => bot.id === selectedBotId);
  const scopedBot = showingGroups ? undefined : selectedBot;
  const scopedBotState = scopedBot ? botRunState(scopedBot) : undefined;
  const canStartConversation = Boolean(scopedBot);
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) =>
        (right.endedAt ?? right.startedAt ?? "").localeCompare(
          left.endedAt ?? left.startedAt ?? "",
        ),
      ),
    [sessions],
  );
  const scopePicker = (
    <div className="relative min-w-0 flex-1">
      <NativeSelect
        aria-label="Chat scope"
        className="w-full cursor-pointer appearance-none truncate border-[var(--border)] bg-[var(--surface-raised)] pl-8 pr-8 font-medium hover:bg-[var(--surface-hover)]"
        onChange={(event) => {
          const scope = event.currentTarget.value;
          if (scope === "groups") onSelectGroups();
          else if (scope.startsWith("bot:")) onSelectBot(scope.slice(4));
        }}
        ref={scopePickerRef}
        value={
          showingGroups ? "groups" : selectedBot ? `bot:${selectedBotId}` : ""
        }
      >
        <option disabled value="">
          Choose a bot
        </option>
        {bots.length ? (
          <optgroup label="Bots">
            {bots.map((bot) => (
              <option key={bot.id} value={`bot:${bot.id}`}>
                {bot.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value="groups">Groups</option>
      </NativeSelect>
      <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[var(--muted)]">
        {scopedBotState ? (
          <RunState compact state={scopedBotState} />
        ) : (
          <UiIcon icon={showingGroups ? Users : MessageSquare} />
        )}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[var(--muted)]">
        <UiIcon icon={ChevronDown} />
      </div>
    </div>
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
        <div className="grid shrink-0 gap-1 px-1 pb-3 [-webkit-app-region:no-drag]">
          <button
            className={sidebarAction}
            onClick={onOpenPalette}
            title={compact ? "Search" : undefined}
            type="button"
          >
            <UiIcon icon={Search} size="sm" />
            <span className={compact ? "sr-only" : ""}>Search</span>
          </button>
          {compact ? (
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
          ) : (
            <ContextActionMenu
              className="group flex min-w-0 items-center gap-1"
              items={
                scopedBot
                  ? [
                      {
                        id: "manage",
                        label: "Manage bots…",
                        onSelect: () => onSetView("agents"),
                      },
                      {
                        id: "copy-name",
                        label: "Copy bot name",
                        separatorBefore: true,
                        onSelect: () => void copyContextText(scopedBot.name),
                      },
                      {
                        id: "copy-id",
                        label: "Copy bot ID",
                        onSelect: () => void copyContextText(scopedBot.id),
                      },
                    ]
                  : []
              }
              label={`${scopedBot?.name ?? "Chat scope"} actions`}
              scopeKey={scopedBot?.id}
              trigger={
                scopedBot ? (
                  <button
                    aria-label={`${scopedBot.name} actions`}
                    className={ROW_MENU_TRIGGER_CLASS}
                    type="button"
                  >
                    <UiIcon icon={MoreHorizontal} />
                  </button>
                ) : undefined
              }
            >
              {scopePicker}
            </ContextActionMenu>
          )}
          <button
            className={sidebarAction}
            disabled={!canStartConversation}
            onClick={() => onStartConversation(projectScope)}
            type="button"
            title={
              !canStartConversation
                ? "Choose a bot to start a conversation"
                : compact
                  ? "New conversation"
                  : undefined
            }
          >
            <UiIcon icon={Plus} size="sm" />
            <span className={compact ? "sr-only" : ""}>New conversation</span>
          </button>
        </div>
        <nav
          aria-label="Bots and conversations"
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
          {!compact &&
          (showingGroups || selectedBot || sortedSessions.length > 0) ? (
            <section
              aria-label={
                showingGroups ? "Group chats" : "Recent conversations"
              }
            >
              <h2 className="px-3 pb-1 text-xs font-medium text-[var(--muted)]">
                {showingGroups ? "Group chats" : "Chats"}
              </h2>
              {sortedSessions.length ? (
                sortedSessions.map((session) => (
                  <ContextActionMenu
                    className="group flex min-w-0 items-center"
                    items={[
                      {
                        id: "open",
                        label: "Open conversation",
                        onSelect: () => onOpenSession(session.sessionId),
                      },
                      {
                        id: "copy-title",
                        label: "Copy conversation title",
                        disabled: !session.title,
                        separatorBefore: true,
                        onSelect: () =>
                          void copyContextText(session.title || ""),
                      },
                      {
                        id: "copy-id",
                        label: "Copy conversation ID",
                        onSelect: () => void copyContextText(session.sessionId),
                      },
                    ]}
                    label={`${session.title || "New conversation"} actions`}
                    scopeKey={`conversation:${session.sessionId}`}
                    key={session.sessionId}
                    trigger={
                      <button
                        aria-label={`${session.title || "New conversation"} actions`}
                        className={ROW_MENU_TRIGGER_CLASS}
                        type="button"
                      >
                        <UiIcon icon={MoreHorizontal} size="sm" />
                      </button>
                    }
                  >
                    <button
                      aria-current={
                        navigationView === "chat" &&
                        session.sessionId === selectedSession
                          ? "page"
                          : undefined
                      }
                      className={`${SIDEBAR_ACTION_CLASS} min-w-0 flex-1 px-3`}
                      onClick={() => onOpenSession(session.sessionId)}
                      title={session.title || "New conversation"}
                      type="button"
                    >
                      <span className="min-w-0 truncate">
                        {session.title || "New conversation"}
                      </span>
                    </button>
                  </ContextActionMenu>
                ))
              ) : (
                <p className="px-2 py-2 text-xs text-[var(--muted)]">
                  {showingGroups
                    ? "No group chats yet."
                    : "No conversations yet."}
                </p>
              )}
              {!showingGroups ? (
                <button
                  aria-current={
                    navigationView === "sessions" ? "page" : undefined
                  }
                  className="min-h-10 w-full rounded-[var(--radius-md)] px-3 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-current:font-semibold aria-current:text-[var(--text)] max-[760px]:min-h-11"
                  onClick={() => onSetView("sessions")}
                  type="button"
                >
                  All conversations
                </button>
              ) : null}
            </section>
          ) : null}
        </nav>
        {botStatus === "ready" || botStatus === "refreshing" ? (
          <button
            className={`${sidebarAction} mx-1 mb-2 shrink-0 [-webkit-app-region:no-drag]`}
            onClick={onAddBot}
            title={compact ? "Add bot" : undefined}
            type="button"
          >
            <UiIcon icon={Plus} size="sm" />
            <span className={compact ? "sr-only" : ""}>Add bot</span>
          </button>
        ) : null}
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
