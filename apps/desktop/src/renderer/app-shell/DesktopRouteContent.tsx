import { lazy, type ReactNode } from "react";
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
import type { ProjectLike, ProjectScope } from "../components/ProjectManager";
import type { View } from "../desktop-navigation";
import type { DesktopNavigationIntent } from "../desktop-navigation-intent";
import type { ApiResource } from "../lib";

const DashboardPage = lazy(() =>
  import("../DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const ChatPage = lazy(() =>
  import("../ChatPage").then((module) => ({ default: module.ChatPage })),
);
const CodingWorkspacePage = lazy(() =>
  import("../CodingWorkspacePage").then((module) => ({
    default: module.CodingWorkspacePage,
  })),
);
const BrowserPage = lazy(() =>
  import("../BrowserPage").then((module) => ({ default: module.BrowserPage })),
);
const GatewayPage = lazy(() =>
  import("../GatewayPage").then((module) => ({ default: module.GatewayPage })),
);
const OrchestrationPage = lazy(() =>
  import("../OrchestrationPage").then((module) => ({
    default: module.OrchestrationPage,
  })),
);
const SessionsPage = lazy(() =>
  import("../WorkspacePages").then((module) => ({
    default: module.SessionsPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("../WorkspacePages").then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const ActivityPage = lazy(() =>
  import("../ActivityPage").then((module) => ({
    default: module.ActivityPage,
  })),
);
const MediaPage = lazy(() =>
  import("../MediaPage").then((module) => ({ default: module.MediaPage })),
);
const MemoryPage = lazy(() =>
  import("../MemoryPage").then((module) => ({ default: module.MemoryPage })),
);
const ModelsPage = lazy(() =>
  import("../ModelsPage").then((module) => ({ default: module.ModelsPage })),
);
const ConnectionsPage = lazy(() =>
  import("../ConnectionsPage").then((module) => ({
    default: module.ConnectionsPage,
  })),
);
const ToolsPage = lazy(() =>
  import("../ToolsPage").then((module) => ({ default: module.ToolsPage })),
);
const SkillsPage = lazy(() =>
  import("../SkillsPage").then((module) => ({ default: module.SkillsPage })),
);
const PluginsPage = lazy(() =>
  import("../PluginsPage").then((module) => ({ default: module.PluginsPage })),
);
const ProfilesPage = lazy(() =>
  import("../ProfilesPage").then((module) => ({
    default: module.ProfilesPage,
  })),
);
const AutomationsPage = lazy(() =>
  import("../AutomationsPage").then((module) => ({
    default: module.AutomationsPage,
  })),
);
const LogsPage = lazy(() =>
  import("../LogsPage").then((module) => ({ default: module.LogsPage })),
);
const SettingsPage = lazy(() =>
  import("../SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const KeysPage = lazy(() =>
  import("../KeysPage").then((module) => ({ default: module.KeysPage })),
);
const DocsPage = lazy(() =>
  import("../DocsPage").then((module) => ({ default: module.DocsPage })),
);
const RuntimePage = lazy(() =>
  import("../RuntimePage").then((module) => ({ default: module.RuntimePage })),
);
const CompatibilityPage = lazy(() =>
  import("../CompatibilityPage").then((module) => ({
    default: module.CompatibilityPage,
  })),
);
const RegistryPage = lazy(() =>
  import("../RegistryPage").then((module) => ({
    default: module.RegistryPage,
  })),
);
const SetupPage = lazy(() =>
  import("../SetupPage").then((module) => ({ default: module.SetupPage })),
);

export interface DesktopRouteNavigation {
  setView: (view: View) => void;
  selectSession: (sessionId: string) => void;
  openSession: (sessionId: string) => void;
  chooseRepositoryForConversation: (
    targetSessionId?: string,
  ) => void | Promise<void>;
  createConversation: () => void;
  transitionToProjectScope: (
    scope: ProjectScope,
    sessionId: string,
    nextView?: View,
    onActivated?: () => void,
  ) => void;
  consumeNavigationIntent: (id: string) => void;
  openChatWithContext: (request: ChatContextRequest) => void;
  openProjectManager: () => void;
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
  chatChromeHost: HTMLElement | null;
  workspacePath: string;
  approvalsResource: ApiResource<{ approvals?: unknown[] }>;
  refreshRuntime: () => Promise<boolean>;
  navigation: DesktopRouteNavigation;
}

export function DesktopRouteContent({
  activeProject,
  approvalsResource,
  backend,
  chatChromeHost,
  navigation,
  onChooseWorkspace,
  onConsumeContextHandoff,
  onOpenWorkspacePath,
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
  const active = backend.phase === "ready";

  switch (view) {
    case "dashboard":
      return (
        <DashboardPage
          active={active}
          approvalsResource={approvalsResource}
          onOpenChat={(sessionId) => {
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
        <ChatPage
          activeProject={activeProject}
          backend={backend}
          onChooseRepository={() =>
            navigation.chooseRepositoryForConversation(selectedSession)
          }
          onOpenProjectManager={navigation.openProjectManager}
          onRequestNewConversation={navigation.createConversation}
          onSelectProjectForNewChat={(scope) =>
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
        <CodingWorkspacePage
          active={active}
          key={workspacePath || "local-workspace"}
          navigationIntent={pendingNavigationIntent}
          onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
          onChooseWorkspace={onChooseWorkspace}
          onOpenWorkspacePath={onOpenWorkspacePath}
          onSendToChat={navigation.openChatWithContext}
          projectScope={projectScope}
          workspacePath={workspacePath}
        />
      );
    case "browser":
      return (
        <BrowserPage
          active={active}
          onSendToChat={(text) =>
            navigation.openChatWithContext({
              text,
              workspacePath,
              projectScope,
            })
          }
        />
      );
    case "gateway":
      return <GatewayPage active={active} />;
    case "review":
    case "orchestration":
      return (
        <OrchestrationPage
          active={active}
          key={`${workspacePath}\u0000${projectScope}`}
          navigationIntent={pendingNavigationIntent}
          onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
          onSectionChange={(section) => {
            if (section === "review" && view !== "review") {
              navigation.setView("review");
            } else if (section !== "review" && view === "review") {
              navigation.setView("orchestration");
            }
          }}
          onSendToChat={navigation.openChatWithContext}
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
        <SessionsPage
          active={active}
          openChat={navigation.openSession}
          projectId={
            activeProject?.id ??
            (projectScope === "unscoped" ? null : undefined)
          }
          refresh={refreshRuntime}
          sessions={scopedSessions}
        />
      );
    case "activity":
      return <ActivityPage active={active} />;
    case "analytics":
      return <AnalyticsPage active={active} />;
    case "media":
      return <MediaPage active={active} />;
    case "models":
      return (
        <ModelsPage
          active={active}
          refreshRuntime={refreshRuntime}
          runtime={runtime}
        />
      );
    case "connections":
      return <ConnectionsPage active={active} />;
    case "tools":
      return <ToolsPage active={active} />;
    case "skills":
      return <SkillsPage active={active} />;
    case "plugins":
      return <PluginsPage active={active} />;
    case "memory":
      return <MemoryPage active={active} />;
    case "automations":
      return <AutomationsPage active={active} />;
    case "profiles":
      return <ProfilesPage active={active} />;
    case "logs":
      return <LogsPage active={active} />;
    case "settings":
      return <SettingsPage active={active} />;
    case "keys":
      return <KeysPage active={active} />;
    case "docs":
      return <DocsPage active={active} />;
    case "runtime":
      return (
        <RuntimePage
          active={backend.phase === "ready" || backend.phase === "degraded"}
          onOpenProviders={() => navigation.setView("connections")}
        />
      );
    case "compatibility":
      return (
        <CompatibilityPage
          active={backend.phase === "ready" || backend.phase === "degraded"}
        />
      );
    case "registry":
      return <RegistryPage active={active} />;
    case "operatorSetup":
      return (
        <SetupPage
          active={active}
          onOpenProviders={() => navigation.setView("connections")}
        />
      );
    default:
      return null;
  }
}
