import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type {
  DoolittleDesktopBridge,
  SessionSummary,
} from "../../shared/contracts";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import {
  NewConversationControl,
  ProjectHistorySidebar,
} from "../components/ProjectSidebar";
import {
  PRIMARY_NAV_ITEMS,
  type View,
  workspaceName,
} from "../desktop-navigation";
import { Icon } from "../lib";
import { APP_SIDEBAR_WIDTH } from "../panel-layout";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import {
  APP_BRAND_CLASS,
  APP_BRAND_COLLAPSED_CLASS,
  APP_BRAND_COPY_CLASS,
  APP_BRAND_MARK_CLASS,
  APP_SIDEBAR_CLASS,
  APP_SIDEBAR_COLLAPSED_CLASS,
  APP_SIDEBAR_DARWIN_CLASS,
  APP_SIDEBAR_MOBILE_CLASS,
  APP_SIDEBAR_MOBILE_CLOSED_CLASS,
  APP_SIDEBAR_MOBILE_OPEN_CLASS,
  ICON_BUTTON_CLASS,
  SIDEBAR_ACCOUNT_ARROW_CLASS,
  SIDEBAR_ACCOUNT_CLASS,
  SIDEBAR_ACCOUNT_SELECTED_CLASS,
  SIDEBAR_APPEARANCE_CLASS,
  SIDEBAR_COLLAPSE_CLASS,
  SIDEBAR_COLLAPSE_COLLAPSED_CLASS,
  SIDEBAR_DOCK_HEADING_CLASS,
  SIDEBAR_FOCUS_NAV_CLASS,
  SIDEBAR_FOOTER_ACTIONS_CLASS,
  SIDEBAR_FOOTER_CLASS,
  SIDEBAR_MODE_BUTTON_CLASS,
  SIDEBAR_MODE_BUTTON_SELECTED_CLASS,
  SIDEBAR_MODE_SIGNAL_CLASS,
  SIDEBAR_MODE_SIGNAL_SELECTED_CLASS,
  SIDEBAR_MODE_SWITCH_CLASS,
  SIDEBAR_QUICK_ACTIONS_CLASS,
  SIDEBAR_QUICK_ACTIONS_COLLAPSED_CLASS,
  SIDEBAR_SCRIM_CLASS,
  SIDEBAR_SCRIM_HIDDEN_CLASS,
  SIDEBAR_SCRIM_VISIBLE_CLASS,
  SIDEBAR_UTILITY_BUTTON_CLASS,
  SIDEBAR_UTILITY_BUTTON_OPEN_CLASS,
  SIDEBAR_UTILITY_COPY_CLASS,
  SIDEBAR_UTILITY_MARK_CLASS,
  SIDEBAR_UTILITY_MARK_OPEN_CLASS,
  SIDEBAR_UTILITY_SHORTCUT_CLASS,
} from "./shell-layout";

type DesktopPlatform = DoolittleDesktopBridge["platform"];

export interface DesktopSidebarProps {
  isMobileSidebarMode: boolean;
  mobileSidebarOpen: boolean;
  navCollapsed: boolean;
  sidebarOpen: boolean;
  projectScope: ProjectScope;
  newConversationMenuOpen: boolean;
  sidebarWidth: number;
  projectCards: readonly ProjectLike[];
  sessions: readonly SessionSummary[];
  selectedSession: string;
  view: View;
  navigationView: View;
  workspacePath: string;
  resolvedAppearance: "dark" | "light";
  platform: DesktopPlatform;
  sidebarRef: RefObject<HTMLElement | null>;
  onSidebarKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onClose: () => void;
  onResize: (width: number) => void;
  onToggleNavigation: () => void;
  onSetNewConversationMenuOpen: (open: boolean) => void;
  onOpenPalette: () => void;
  onChooseRepository: () => void | Promise<void>;
  onManageProjects: () => void;
  onStartConversation: (scope: ProjectScope) => void;
  onOpenSession: (sessionId: string) => void;
  onSelectScope: (scope: ProjectScope) => void;
  onViewAll: () => void;
  onPreloadView: (view: View) => void;
  onSetView: (view: View) => void;
  onToggleUtilities: () => void;
  utilityOpen: boolean;
  onToggleAppearance: () => void;
}

export function DesktopSidebar({
  isMobileSidebarMode,
  mobileSidebarOpen,
  navCollapsed,
  sidebarOpen,
  projectScope,
  newConversationMenuOpen,
  sidebarWidth,
  projectCards,
  sessions,
  selectedSession,
  view,
  navigationView,
  workspacePath,
  resolvedAppearance,
  platform,
  sidebarRef,
  onSidebarKeyDown,
  onClose,
  onResize,
  onToggleNavigation,
  onSetNewConversationMenuOpen,
  onOpenPalette,
  onChooseRepository,
  onManageProjects,
  onStartConversation,
  onOpenSession,
  onSelectScope,
  onViewAll,
  onPreloadView,
  onSetView,
  onToggleUtilities,
  utilityOpen,
  onToggleAppearance,
}: DesktopSidebarProps) {
  const compact = navCollapsed && !isMobileSidebarMode;
  const mobileSidebarDialogProps = mobileSidebarOpen
    ? ({ "aria-modal": true, role: "dialog" } as const)
    : {};

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`${SIDEBAR_SCRIM_CLASS} ${
          mobileSidebarOpen
            ? SIDEBAR_SCRIM_VISIBLE_CLASS
            : SIDEBAR_SCRIM_HIDDEN_CLASS
        }`}
        onClick={onClose}
        tabIndex={sidebarOpen ? 0 : -1}
        type="button"
      />
      <aside
        {...mobileSidebarDialogProps}
        aria-hidden={
          isMobileSidebarMode && !mobileSidebarOpen ? true : undefined
        }
        aria-label={mobileSidebarOpen ? "Application navigation" : undefined}
        className={`${APP_SIDEBAR_CLASS}${
          platform === "darwin" ? ` ${APP_SIDEBAR_DARWIN_CLASS}` : ""
        }${
          isMobileSidebarMode
            ? ` ${APP_SIDEBAR_MOBILE_CLASS} ${
                mobileSidebarOpen
                  ? APP_SIDEBAR_MOBILE_OPEN_CLASS
                  : APP_SIDEBAR_MOBILE_CLOSED_CLASS
              }`
            : ""
        }${compact ? ` ${APP_SIDEBAR_COLLAPSED_CLASS}` : ""}`}
        onKeyDown={onSidebarKeyDown}
        ref={sidebarRef}
      >
        {!navCollapsed && !isMobileSidebarMode ? (
          <PanelResizeHandle
            bounds={APP_SIDEBAR_WIDTH}
            className="app-sidebar-resizer"
            direction="grow-right"
            label="Resize project navigation"
            onResize={onResize}
            value={sidebarWidth}
          />
        ) : null}
        <div
          className={`${APP_BRAND_CLASS}${
            compact ? ` ${APP_BRAND_COLLAPSED_CLASS}` : ""
          }`}
        >
          <div className={APP_BRAND_MARK_CLASS} aria-hidden="true">
            <span>D</span>
            <i />
          </div>
          <div className={APP_BRAND_COPY_CLASS}>
            <strong>Doolittle</strong>
            <span>{"ElizaOS // desktop"}</span>
          </div>
          <button
            aria-label={
              navCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            className={`${SIDEBAR_COLLAPSE_CLASS}${
              compact ? ` ${SIDEBAR_COLLAPSE_COLLAPSED_CLASS}` : ""
            }`}
            onClick={onToggleNavigation}
            title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            {navCollapsed ? "›" : "‹"}
          </button>
        </div>
        <div
          className={`${SIDEBAR_QUICK_ACTIONS_CLASS}${
            compact ? ` ${SIDEBAR_QUICK_ACTIONS_COLLAPSED_CLASS}` : ""
          }`}
        >
          <NewConversationControl
            activeScope={projectScope}
            isOpen={newConversationMenuOpen}
            onChooseRepository={onChooseRepository}
            onManageProjects={onManageProjects}
            onOpenChange={onSetNewConversationMenuOpen}
            onStart={onStartConversation}
            projects={projectCards}
            shortcut={platform === "darwin" ? "⌘N" : "Ctrl N"}
          />
          <button
            aria-label="Search pages and commands"
            onClick={onOpenPalette}
            title="Search"
            type="button"
          >
            <span aria-hidden="true">⌕</span>
            <strong>Search</strong>
            <kbd>{platform === "darwin" ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <button
            aria-label="Choose repository for a new conversation"
            onClick={() => void onChooseRepository()}
            title={workspacePath || "Choose a project folder"}
            type="button"
          >
            <span aria-hidden="true">◇</span>
            <strong>Projects</strong>
            <kbd>{platform === "darwin" ? "⌘O" : "Ctrl O"}</kbd>
          </button>
        </div>
        <ProjectHistorySidebar
          activeScope={projectScope}
          onChooseRepository={onChooseRepository}
          onManageProjects={onManageProjects}
          onOpenSession={onOpenSession}
          onSelectScope={onSelectScope}
          onStartConversation={onStartConversation}
          onViewAll={onViewAll}
          projects={projectCards}
          selectedSessionId={selectedSession}
          sessions={sessions}
        />
        <nav className={SIDEBAR_FOCUS_NAV_CLASS} aria-label="Primary workspace">
          <div aria-hidden="true" className={SIDEBAR_DOCK_HEADING_CLASS}>
            <span>Operator deck</span>
            <i>{"//"}</i>
          </div>
          <fieldset className={SIDEBAR_MODE_SWITCH_CLASS}>
            <legend className="sr-only">Workspace modes</legend>
            {PRIMARY_NAV_ITEMS.map((item) => (
              <button
                aria-current={navigationView === item.id ? "page" : undefined}
                className={`${SIDEBAR_MODE_BUTTON_CLASS}${
                  navigationView === item.id
                    ? ` ${SIDEBAR_MODE_BUTTON_SELECTED_CLASS}`
                    : ""
                }`}
                key={item.id}
                onClick={() => onSetView(item.id)}
                onFocus={() => onPreloadView(item.id)}
                onPointerDown={() => onPreloadView(item.id)}
                onPointerEnter={() => onPreloadView(item.id)}
                title={item.description}
                type="button"
              >
                <Icon name={item.id} />
                <span>{item.label}</span>
                <i
                  aria-hidden="true"
                  className={`${SIDEBAR_MODE_SIGNAL_CLASS}${
                    navigationView === item.id
                      ? ` ${SIDEBAR_MODE_SIGNAL_SELECTED_CLASS}`
                      : ""
                  }`}
                />
              </button>
            ))}
          </fieldset>
          <button
            aria-expanded={utilityOpen}
            className={`${SIDEBAR_UTILITY_BUTTON_CLASS}${
              utilityOpen ? ` ${SIDEBAR_UTILITY_BUTTON_OPEN_CLASS}` : ""
            }`}
            onClick={onToggleUtilities}
            title="Open every Doolittle tool and setting"
            type="button"
          >
            <span
              aria-hidden="true"
              className={`${SIDEBAR_UTILITY_MARK_CLASS}${
                utilityOpen ? ` ${SIDEBAR_UTILITY_MARK_OPEN_CLASS}` : ""
              }`}
            >
              <Icon name="tools" />
            </span>
            <span className={SIDEBAR_UTILITY_COPY_CLASS}>
              <strong>Tools & settings</strong>
              <small>Models · runtime · skills</small>
            </span>
            <kbd className={SIDEBAR_UTILITY_SHORTCUT_CLASS}>⌘</kbd>
          </button>
        </nav>
        <div className={SIDEBAR_FOOTER_CLASS}>
          <div className={SIDEBAR_FOOTER_ACTIONS_CLASS}>
            <button
              aria-current={view === "settings" ? "page" : undefined}
              aria-label="Open settings"
              className={`${SIDEBAR_ACCOUNT_CLASS}${
                view === "settings" ? ` ${SIDEBAR_ACCOUNT_SELECTED_CLASS}` : ""
              }`}
              onClick={() => onSetView("settings")}
              onFocus={() => onPreloadView("settings")}
              onPointerDown={() => onPreloadView("settings")}
              onPointerEnter={() => onPreloadView("settings")}
              title="Settings"
              type="button"
            >
              <span>DL</span>
              <div>
                <strong>Settings</strong>
                <small title={workspacePath}>
                  {workspaceName(workspacePath)}
                </small>
              </div>
              <i aria-hidden="true" className={SIDEBAR_ACCOUNT_ARROW_CLASS}>
                ›
              </i>
            </button>
            <button
              aria-label={`Use ${
                resolvedAppearance === "dark" ? "light" : "dark"
              } appearance`}
              className={`${ICON_BUTTON_CLASS} ${SIDEBAR_APPEARANCE_CLASS}`}
              onClick={onToggleAppearance}
              title="Toggle appearance"
              type="button"
            >
              {resolvedAppearance === "dark" ? "☼" : "◐"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
