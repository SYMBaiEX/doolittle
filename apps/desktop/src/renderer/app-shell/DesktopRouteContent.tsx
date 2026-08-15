import type { ReactNode } from "react";
import type {
  BackendState,
  RuntimeStatus,
  SessionSummary,
  WorkspacePickResult,
} from "../../shared/contracts";
import type {
  ChatContextHandoff,
  ChatContextRequest,
} from "../chat-context-handoff";
import type { View } from "../desktop-navigation";
import type { DesktopNavigationIntent } from "../desktop-navigation-intent";
import type { ApiResource } from "../lib";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import {
  canRenderDesktopRoute,
  desktopRouteCapabilities,
} from "./desktop-route-capabilities";
import { getDesktopRouteComponent } from "./desktop-route-registry";

export interface DesktopRouteNavigation {
  setView: (view: View) => void;
  selectSession: (sessionId: string) => void;
  openSession: (sessionId: string) => void;
  chooseRepositoryForConversation: (
    targetSessionId?: string,
  ) => void | Promise<void>;
  createConversation: () => void;
  openChatTerminal: () => void;
  transitionToProjectScope: (
    scope: ProjectScope,
    sessionId: string,
    nextView?: View,
    onActivated?: () => boolean | undefined,
  ) => Promise<boolean>;
  consumeNavigationIntent: (id: string) => void;
  openChatWithContext: (request: ChatContextRequest) => void;
  openProjectManager: () => void;
  openWorkspaceFile: (path: string) => void;
}

export interface DesktopRouteContentProps {
  view: View;
  backend: BackendState;
  runtime: RuntimeStatus | null;
  activeProject: Pick<
    ProjectLike,
    "id" | "name" | "color" | "primaryPath"
  > | null;
  projectCards: readonly ProjectLike[];
  projectLabels: Readonly<Record<string, string>>;
  projectScope: ProjectScope;
  scopedSessions: SessionSummary[];
  selectedSession: string;
  pendingApprovals: number;
  runningTasks: number;
  pendingNavigationIntent: DesktopNavigationIntent | null;
  pendingContextHandoff: ChatContextHandoff | null;
  onConsumeContextHandoff: (id: string) => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onCodeWorkspaceDirtyChange?: (dirty: boolean) => void;
  chatChromeHost: HTMLElement | null;
  workspacePath: string;
  approvalsResource: ApiResource<{ approvals?: unknown[] }>;
  tasksResource: ApiResource<{ tasks?: unknown[] }>;
  refreshRuntime: () => Promise<boolean>;
  navigation: DesktopRouteNavigation;
}

export function DesktopRouteContent({
  activeProject,
  approvalsResource,
  tasksResource,
  backend,
  chatChromeHost,
  navigation,
  onChooseWorkspace,
  onConsumeContextHandoff,
  onOpenWorkspacePath,
  onCodeWorkspaceDirtyChange,
  pendingApprovals,
  pendingContextHandoff,
  pendingNavigationIntent,
  projectCards,
  projectLabels,
  projectScope,
  refreshRuntime,
  runtime,
  runningTasks,
  scopedSessions,
  selectedSession,
  view,
  workspacePath,
}: DesktopRouteContentProps): ReactNode {
  const active = canRenderDesktopRoute(view, backend.phase);
  const Route = getDesktopRouteComponent(view);

  switch (view) {
    case "dashboard":
      return (
        <Route
          active={active}
          approvalsResource={approvalsResource}
          tasksResource={tasksResource}
          runtime={runtime}
          sessions={scopedSessions}
          workspacePath={workspacePath}
          refreshRuntime={refreshRuntime}
          onOpenChat={(sessionId: string) => {
            if (sessionId) navigation.openSession(sessionId);
            else navigation.setView("chat");
          }}
          onOpenReview={() => navigation.setView("review")}
          onOpenSetup={() => navigation.setView("operatorSetup")}
          onOpenTasks={() => navigation.setView("orchestration")}
          onOpenProviders={() => navigation.setView("connections")}
        />
      );
    case "chat":
      return (
        <Route
          activeProject={activeProject}
          backend={backend}
          onChooseRepository={() =>
            navigation.chooseRepositoryForConversation(selectedSession)
          }
          onOpenProjectManager={navigation.openProjectManager}
          onRequestNewConversation={navigation.createConversation}
          onSelectProjectForNewChat={(scope: ProjectScope) =>
            navigation.transitionToProjectScope(scope, selectedSession, "chat")
          }
          onSelect={navigation.selectSession}
          onOpenModelsPage={() => navigation.setView("models")}
          onOpenProvidersPage={() => navigation.setView("connections")}
          onOpenWorkspaceView={navigation.setView}
          onConsumeContextHandoff={onConsumeContextHandoff}
          pendingApprovals={pendingApprovals}
          pendingContextHandoff={pendingContextHandoff}
          projects={projectCards}
          projectLabels={projectLabels}
          refreshRuntime={refreshRuntime}
          remoteSessions={scopedSessions}
          runningTasks={runningTasks}
          runtime={runtime}
          selectedId={selectedSession}
          chromeHost={chatChromeHost}
          workspacePath={workspacePath}
        />
      );
    case "code":
      return (
        <Route
          active={active}
          key={workspacePath || "local-workspace"}
          navigationIntent={pendingNavigationIntent}
          onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
          onChooseWorkspace={onChooseWorkspace}
          onOpenWorkspacePath={onOpenWorkspacePath}
          onOpenChatTerminal={navigation.openChatTerminal}
          onDirtyChange={onCodeWorkspaceDirtyChange}
          onSendToChat={navigation.openChatWithContext}
          projectScope={projectScope}
          workspacePath={workspacePath}
        />
      );
    case "browser":
      return (
        <Route
          active={active}
          onSendToChat={(text: string) =>
            navigation.openChatWithContext({
              text,
              workspacePath,
              projectScope,
            })
          }
        />
      );
    case "gateway":
      return <Route active={active} />;
    case "review":
    case "orchestration":
      return (
        <Route
          active={active}
          key={`${workspacePath}\u0000${projectScope}`}
          navigationIntent={pendingNavigationIntent}
          onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
          onSectionChange={(section: string) => {
            if (section === "review" && view !== "review") {
              navigation.setView("review");
            } else if (section !== "review" && view === "review") {
              navigation.setView("orchestration");
            }
          }}
          onSendToChat={navigation.openChatWithContext}
          onOpenWorkspaceFile={navigation.openWorkspaceFile}
          projectScope={projectScope}
          reviewMode={view === "review"}
          workspaceLabel={
            activeProject?.name ??
            (projectScope === "unscoped" ? "General" : "All projects")
          }
          workspacePath={workspacePath}
        />
      );
    case "sessions":
      return (
        <Route
          active={active}
          openChat={navigation.openSession}
          onNewConversation={navigation.createConversation}
          projectId={
            activeProject?.id ??
            (projectScope === "unscoped" ? null : undefined)
          }
          refresh={refreshRuntime}
          sessions={scopedSessions}
        />
      );
    case "activity":
      return <Route active={active} />;
    case "analytics":
      return (
        <Route
          active={active}
          onNewConversation={navigation.createConversation}
        />
      );
    case "media":
      return <Route active={active} />;
    case "models":
      return (
        <Route
          active={active}
          refreshRuntime={refreshRuntime}
          runtime={runtime}
        />
      );
    case "connections":
      return <Route active={active} />;
    case "tools":
      return <Route active={active} />;
    case "skills":
      return <Route active={active} />;
    case "plugins":
      return <Route active={active} />;
    case "memory":
      return <Route active={active} />;
    case "automations":
      return <Route active={active} />;
    case "profiles":
      return <Route active={active} />;
    case "logs":
      return <Route active={active} />;
    case "settings":
      return <Route active={active} />;
    case "keys":
      return <Route active={active} />;
    case "docs":
      return <Route active={active} />;
    case "runtime":
      return (
        <Route
          active={backend.phase === "ready" || backend.phase === "degraded"}
          readOnly={!desktopRouteCapabilities("runtime", backend.phase).writes}
          onOpenProviders={() => navigation.setView("connections")}
        />
      );
    case "compatibility":
      return (
        <Route
          active={backend.phase === "ready" || backend.phase === "degraded"}
        />
      );
    case "registry":
      return <Route active={active} />;
    case "operatorSetup":
      return (
        <Route
          active={active}
          onOpenProviders={() => navigation.setView("connections")}
        />
      );
    default:
      return null;
  }
}
