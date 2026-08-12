import {
  type ComponentType,
  type LazyExoticComponent,
  lazy,
  type ReactNode,
} from "react";
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
import { type View, views } from "../desktop-navigation";
import type { DesktopNavigationIntent } from "../desktop-navigation-intent";
import { type ApiResource, prefetchApiResource } from "../lib";
import type { ProjectLike, ProjectScope } from "../project-manager/models";

type RouteLoader = () => Promise<unknown>;
type ComponentExportKey<Module> = {
  [Key in keyof Module]-?: Module[Key] extends ComponentType<infer _Props>
    ? Key
    : never;
}[keyof Module];
type RouteComponent<Module, Key extends keyof Module> =
  Module[Key] extends ComponentType<infer Props> ? ComponentType<Props> : never;

const registeredRouteLoaders: Partial<Record<View, RouteLoader>> = {};

/** Register lazy rendering and preloading from one loader declaration. */
function lazyNamedRoute<Module extends object, Key extends keyof Module>(
  routeViews: readonly View[],
  load: () => Promise<Module>,
  exportName: Key & ComponentExportKey<Module>,
): LazyExoticComponent<RouteComponent<Module, Key>> {
  for (const view of routeViews) registeredRouteLoaders[view] = load;
  return lazy(async () => {
    const module = await load();
    const component = module[exportName];
    if (typeof component !== "function") {
      throw new Error(`Missing route component export: ${String(exportName)}`);
    }
    return { default: component } as {
      default: RouteComponent<Module, Key>;
    };
  });
}

const loadWorkspacePages = () => import("../WorkspacePages");
const DashboardPage = lazyNamedRoute(
  ["dashboard"],
  () => import("../DashboardPage"),
  "DashboardPage",
);
const ChatPage = lazyNamedRoute(
  ["chat"],
  () => import("../ChatPage"),
  "ChatPage",
);
const CodingWorkspacePage = lazyNamedRoute(
  ["code"],
  () => import("../CodingWorkspacePage"),
  "CodingWorkspacePage",
);
const BrowserPage = lazyNamedRoute(
  ["browser"],
  () => import("../BrowserPage"),
  "BrowserPage",
);
const GatewayPage = lazyNamedRoute(
  ["gateway"],
  () => import("../GatewayPage"),
  "GatewayPage",
);
const OrchestrationPage = lazyNamedRoute(
  ["review", "orchestration"],
  () => import("../OrchestrationPage"),
  "OrchestrationPage",
);
const SessionsPage = lazyNamedRoute(
  ["sessions"],
  loadWorkspacePages,
  "SessionsPage",
);
const AnalyticsPage = lazyNamedRoute(
  ["analytics"],
  loadWorkspacePages,
  "AnalyticsPage",
);
const ActivityPage = lazyNamedRoute(
  ["activity"],
  () => import("../ActivityPage"),
  "ActivityPage",
);
const MediaPage = lazyNamedRoute(
  ["media"],
  () => import("../MediaPage"),
  "MediaPage",
);
const MemoryPage = lazyNamedRoute(
  ["memory"],
  () => import("../MemoryPage"),
  "MemoryPage",
);
const ModelsPage = lazyNamedRoute(
  ["models"],
  () => import("../ModelsPage"),
  "ModelsPage",
);
const ConnectionsPage = lazyNamedRoute(
  ["connections"],
  () => import("../ConnectionsPage"),
  "ConnectionsPage",
);
const ToolsPage = lazyNamedRoute(
  ["tools"],
  () => import("../ToolsPage"),
  "ToolsPage",
);
const SkillsPage = lazyNamedRoute(
  ["skills"],
  () => import("../SkillsPage"),
  "SkillsPage",
);
const PluginsPage = lazyNamedRoute(
  ["plugins"],
  () => import("../PluginsPage"),
  "PluginsPage",
);
const ProfilesPage = lazyNamedRoute(
  ["profiles"],
  () => import("../ProfilesPage"),
  "ProfilesPage",
);
const AutomationsPage = lazyNamedRoute(
  ["automations"],
  () => import("../AutomationsPage"),
  "AutomationsPage",
);
const LogsPage = lazyNamedRoute(
  ["logs"],
  () => import("../LogsPage"),
  "LogsPage",
);
const SettingsPage = lazyNamedRoute(
  ["settings"],
  () => import("../SettingsPage"),
  "SettingsPage",
);
const KeysPage = lazyNamedRoute(
  ["keys"],
  () => import("../KeysPage"),
  "KeysPage",
);
const DocsPage = lazyNamedRoute(
  ["docs"],
  () => import("../DocsPage"),
  "DocsPage",
);
const RuntimePage = lazyNamedRoute(
  ["runtime"],
  () => import("../RuntimePage"),
  "RuntimePage",
);
const CompatibilityPage = lazyNamedRoute(
  ["compatibility"],
  () => import("../CompatibilityPage"),
  "CompatibilityPage",
);
const RegistryPage = lazyNamedRoute(
  ["registry"],
  () => import("../RegistryPage"),
  "RegistryPage",
);
const SetupPage = lazyNamedRoute(
  ["operatorSetup"],
  () => import("../SetupPage"),
  "SetupPage",
);

function completeRouteLoaderRegistry(): Readonly<Record<View, RouteLoader>> {
  for (const view of views) {
    if (!registeredRouteLoaders[view]) {
      throw new Error(`Missing desktop route loader: ${view}`);
    }
  }
  return registeredRouteLoaders as Record<View, RouteLoader>;
}

export const DESKTOP_ROUTE_PRELOADERS = completeRouteLoaderRegistry();

export interface DesktopRouteResourcePrefetch {
  path: string;
  dependencies: readonly unknown[];
}

/** Default-view resources that are safe and useful to warm before navigation. */
export const DESKTOP_ROUTE_RESOURCE_PREFETCHES: Readonly<
  Partial<Record<View, readonly DesktopRouteResourcePrefetch[]>>
> = {
  activity: [{ path: "/activity?limit=200", dependencies: [true] }],
  automations: [{ path: "/cron/jobs", dependencies: [true] }],
  browser: [{ path: "/browser/status", dependencies: [true] }],
  compatibility: [{ path: "/runtime/compatibility", dependencies: [true] }],
  connections: [{ path: "/runtime/accounts", dependencies: [true] }],
  dashboard: [
    { path: "/repo/status", dependencies: [true] },
    { path: "/setup/summary", dependencies: [true] },
    { path: "/runtime/account-pool", dependencies: [true] },
  ],
  gateway: [
    { path: "/gateway/state", dependencies: [true] },
    { path: "/gateway/inbox?limit=25", dependencies: [true] },
    { path: "/gateway/outbox?limit=25", dependencies: [true] },
  ],
  keys: [{ path: "/secrets", dependencies: [true] }],
  logs: [{ path: "/logs?limit=500", dependencies: [true, "all", ""] }],
  memory: [{ path: "/memory?target=memory", dependencies: [true] }],
  models: [
    { path: "/settings", dependencies: [true] },
    {
      path: "/runtime/models?refresh=false",
      dependencies: [true, false],
    },
  ],
  operatorSetup: [
    { path: "/setup/summary", dependencies: [true] },
    { path: "/runtime/account-pool", dependencies: [true] },
  ],
  plugins: [{ path: "/runtime/plugins?view=catalog", dependencies: [true] }],
  profiles: [{ path: "/personality", dependencies: [true] }],
  registry: [
    {
      path: "/runtime/registry",
      dependencies: [true, "", undefined],
    },
  ],
  runtime: [
    { path: "/runtime/status", dependencies: [true] },
    { path: "/runtime/account-pool", dependencies: [true] },
    { path: "/autonomy/status", dependencies: [true] },
  ],
  settings: [
    { path: "/settings", dependencies: [true] },
    { path: "/runtime/accounts", dependencies: [true] },
  ],
  skills: [{ path: "/skills", dependencies: [true] }],
  tools: [{ path: "/tools?profile=full", dependencies: [true, "full"] }],
};

export async function warmDesktopRoute(view: View): Promise<void> {
  const resources = DESKTOP_ROUTE_RESOURCE_PREFETCHES[view] ?? [];
  await Promise.all([
    DESKTOP_ROUTE_PRELOADERS[view](),
    ...resources.map(({ dependencies, path }) =>
      prefetchApiResource(path, dependencies),
    ),
  ]);
}

export function preloadDesktopRoute(view: View): void {
  void warmDesktopRoute(view).catch(() => undefined);
}

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
          tasksResource={tasksResource}
          runtime={runtime}
          sessions={scopedSessions}
          refreshRuntime={refreshRuntime}
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
