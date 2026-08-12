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
  const mobileSidebarDialogProps = mobileSidebarOpen
    ? ({ "aria-modal": true, role: "dialog" } as const)
    : {};

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
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
        className={`app-sidebar ${sidebarOpen ? "open" : ""}`}
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
        <div className="app-brand">
          <div className="app-brand-mark" aria-hidden="true">
            <span>D</span>
            <i />
          </div>
          <div className="app-brand-copy">
            <strong>Doolittle</strong>
            <span>{"ElizaOS // desktop"}</span>
          </div>
          <button
            aria-label={
              navCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            className="sidebar-collapse"
            onClick={onToggleNavigation}
            title={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            {navCollapsed ? "›" : "‹"}
          </button>
        </div>
        <div className="sidebar-quick-actions">
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
          isChatView={view === "chat"}
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
        <nav className="sidebar-focus-nav" aria-label="Primary workspace">
          <div aria-hidden="true" className="sidebar-dock-heading">
            <span>Operator deck</span>
            <i>{"//"}</i>
          </div>
          <fieldset className="sidebar-mode-switch">
            <legend className="sr-only">Workspace modes</legend>
            {PRIMARY_NAV_ITEMS.map((item) => (
              <button
                aria-current={navigationView === item.id ? "page" : undefined}
                className={navigationView === item.id ? "selected" : ""}
                key={item.id}
                onClick={() => onSetView(item.id)}
                onFocus={() => onPreloadView(item.id)}
                onPointerEnter={() => onPreloadView(item.id)}
                title={item.description}
                type="button"
              >
                <Icon name={item.id} />
                <span>{item.label}</span>
                <i aria-hidden="true" className="sidebar-mode-signal" />
              </button>
            ))}
          </fieldset>
          <button
            aria-expanded={utilityOpen}
            className={`sidebar-utility-button${utilityOpen ? " is-open" : ""}`}
            onClick={onToggleUtilities}
            title="Open every Doolittle tool and setting"
            type="button"
          >
            <span aria-hidden="true" className="sidebar-utility-mark">
              <Icon name="tools" />
            </span>
            <span className="sidebar-utility-copy">
              <strong>Tools & settings</strong>
              <small>Models · runtime · skills</small>
            </span>
            <kbd className="sidebar-utility-shortcut">⌘</kbd>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-actions">
            <button
              aria-current={view === "settings" ? "page" : undefined}
              aria-label="Open settings"
              className={`sidebar-account${view === "settings" ? " selected" : ""}`}
              onClick={() => onSetView("settings")}
              onFocus={() => onPreloadView("settings")}
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
              <i aria-hidden="true" className="sidebar-account-arrow">
                ›
              </i>
            </button>
            <button
              aria-label={`Use ${
                resolvedAppearance === "dark" ? "light" : "dark"
              } appearance`}
              className="icon-button sidebar-appearance-toggle"
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
