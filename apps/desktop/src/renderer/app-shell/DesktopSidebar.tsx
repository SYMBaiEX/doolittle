import type { BotSummary } from "@doolittle/contracts/bots";
import { ContactRow, StateSurface } from "@doolittle/ui";
import { PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type {
  DoolittleDesktopBridge,
  SessionSummary,
} from "../../shared/contracts";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UiIcon } from "../components/UiIcon";
import type { View } from "../desktop-navigation";
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
  sidebarOpen: boolean;
  sidebarWidth: number;
  selectedBotId: string;
  defaultBotId: string;
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
  onToggleNavigation: () => void;
  onOpenPalette: () => void;
  onStartConversation: (scope: ProjectScope) => void;
  onOpenSession: (sessionId: string) => void;
  onSelectBot: (botId: string) => void;
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

export function DesktopSidebar({
  isMobileSidebarMode,
  mobileSidebarOpen,
  navCollapsed,
  sidebarOpen,
  sidebarWidth,
  selectedBotId,
  defaultBotId,
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
  onToggleNavigation,
  onOpenPalette,
  onStartConversation,
  onOpenSession,
  onSelectBot,
  onAddBot,
  onRetryBots,
  onSetView,
  navigationView,
}: DesktopSidebarProps) {
  const compact = navCollapsed && !isMobileSidebarMode;
  const selectedBotSessions = [...sessions]
    .filter((session) => (session.botId ?? defaultBotId) === selectedBotId)
    .sort((left, right) =>
      (right.endedAt ?? right.startedAt ?? "").localeCompare(
        left.endedAt ?? left.startedAt ?? "",
      ),
    )
    .slice(0, 8);

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`${SIDEBAR_SCRIM_CLASS} ${mobileSidebarOpen ? SIDEBAR_SCRIM_VISIBLE_CLASS : SIDEBAR_SCRIM_HIDDEN_CLASS}`}
        onClick={onClose}
        tabIndex={sidebarOpen ? 0 : -1}
        type="button"
      />
      <aside
        {...(mobileSidebarOpen
          ? { "aria-modal": true as const, role: "dialog" as const }
          : {})}
        aria-hidden={
          isMobileSidebarMode && !mobileSidebarOpen ? true : undefined
        }
        aria-label="Navigation and bots"
        className={`${APP_SIDEBAR_CLASS}${platform === "darwin" ? ` ${APP_SIDEBAR_DARWIN_CLASS}` : ""} ${isMobileSidebarMode ? `${APP_SIDEBAR_MOBILE_CLASS} ${mobileSidebarOpen ? APP_SIDEBAR_MOBILE_OPEN_CLASS : APP_SIDEBAR_MOBILE_CLOSED_CLASS}` : APP_SIDEBAR_DESKTOP_CLASS}${compact ? ` ${APP_SIDEBAR_COLLAPSED_CLASS}` : ""}`}
        onKeyDown={onSidebarKeyDown}
        ref={sidebarRef}
      >
        {!compact && !isMobileSidebarMode ? (
          <PanelResizeHandle
            bounds={APP_SIDEBAR_WIDTH}
            className="app-sidebar-resizer"
            direction="grow-right"
            label="Resize bot navigation"
            onResize={onResize}
            value={sidebarWidth}
          />
        ) : null}
        <div className="flex h-14 shrink-0 items-center gap-2 px-2 [-webkit-app-region:no-drag]">
          <button
            aria-label="Doolittle home"
            className="grid size-8 place-items-center rounded-[var(--radius-md)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
            onClick={() => onSetView("chat")}
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
            aria-label={compact ? "Expand navigation" : "Collapse navigation"}
            className="grid size-10 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
            onClick={onToggleNavigation}
            type="button"
          >
            <UiIcon icon={compact ? PanelLeftOpen : PanelLeftClose} size="sm" />
          </button>
        </div>
        <div className="grid shrink-0 gap-1 px-1 pb-3 [-webkit-app-region:no-drag]">
          <button
            className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-sm hover:bg-[var(--surface-hover)] max-[760px]:min-h-11"
            onClick={onOpenPalette}
            type="button"
          >
            <UiIcon icon={Search} size="sm" />
            <span className={compact ? "sr-only" : ""}>Search</span>
          </button>
          <button
            className="flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-sm hover:bg-[var(--surface-hover)] max-[760px]:min-h-11"
            disabled={!selectedBotId}
            onClick={() => onStartConversation(projectScope)}
            type="button"
          >
            <UiIcon icon={Plus} size="sm" />
            <span className={compact ? "sr-only" : ""}>New conversation</span>
          </button>
        </div>
        <nav
          aria-label="Bots and conversations"
          className="min-h-0 flex-1 overflow-y-auto [-webkit-app-region:no-drag]"
        >
          {!compact ? (
            <h2 className="px-3 pb-1 text-xs font-medium text-[var(--muted)]">
              Bots
            </h2>
          ) : null}
          {botStatus === "loading" || botStatus === "disabled" ? (
            <StateSurface
              kind={botStatus === "disabled" ? "offline" : "loading"}
              title={
                botStatus === "disabled" ? "Runtime offline" : "Loading bots"
              }
            />
          ) : botStatus === "error" && bots.length === 0 ? (
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
          ) : bots.length === 0 ? (
            <StateSurface kind="empty" title="No bots available">
              The local runtime has not returned a bot catalog.
            </StateSurface>
          ) : (
            <>
              {bots.map((bot) => (
                <div key={bot.id}>
                  <ContactRow
                    avatar={bot.name.slice(0, 1).toUpperCase()}
                    detail={bot.isDefault ? "Lead" : undefined}
                    name={bot.name}
                    onSelect={() => onSelectBot(bot.id)}
                    selected={bot.id === selectedBotId}
                    state={botRunState(bot)}
                  />
                  {bot.id === selectedBotId && !compact ? (
                    <div className="ml-4 border-l border-[var(--border)] pl-2">
                      {selectedBotSessions.length ? (
                        selectedBotSessions.map((session) => (
                          <button
                            aria-current={
                              session.sessionId === selectedSession
                                ? "page"
                                : undefined
                            }
                            className="block min-h-10 w-full truncate rounded-[var(--radius-md)] px-2 text-left text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] aria-current:bg-[var(--surface-selected)] max-[760px]:min-h-11"
                            key={session.sessionId}
                            onClick={() => onOpenSession(session.sessionId)}
                            title={session.title || "New conversation"}
                            type="button"
                          >
                            {session.title || "New conversation"}
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-2 text-xs text-[var(--muted)]">
                          No conversations yet.
                        </p>
                      )}
                      <button
                        className="min-h-10 px-2 text-left text-xs text-[var(--muted)] hover:text-[var(--text)]"
                        onClick={() => onSetView("sessions")}
                        type="button"
                      >
                        All conversations
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              <button
                className="mt-2 flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-md)] px-3 text-left text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:min-h-11"
                onClick={onAddBot}
                type="button"
              >
                <UiIcon icon={Plus} size="sm" />
                <span className={compact ? "sr-only" : ""}>Add bot</span>
              </button>
            </>
          )}
        </nav>
        <nav
          aria-label="Other areas"
          className="grid shrink-0 gap-1 border-t border-[var(--border)] px-1 py-2 [-webkit-app-region:no-drag]"
        >
          {(
            [
              ["orchestration", "Team & work"],
              ["connections", "Connections"],
              ["settings", "Settings"],
            ] as const
          ).map(([target, label]) => (
            <button
              aria-current={navigationView === target ? "page" : undefined}
              className="min-h-10 rounded-[var(--radius-md)] px-2 text-left text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] aria-current:bg-[var(--surface-selected)] max-[760px]:min-h-11"
              key={target}
              onClick={() => onSetView(target)}
              type="button"
            >
              {compact ? <span className="sr-only">{label}</span> : label}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
