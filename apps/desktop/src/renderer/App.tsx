import {
  type KeyboardEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActivityEvent,
  ActivityFeedResponse,
  BackendState,
  Project,
  ProjectResponse,
  ProjectsResponse,
  RuntimeStatus,
  SessionSummary,
  SessionsResponse,
  WorkspaceState,
} from "../shared/contracts";
import { ActivityCenter } from "./components/ActivityCenter";
import { type CommandGroup, CommandPalette } from "./components/CommandPalette";
import {
  type ProjectDraft,
  type ProjectLike,
  ProjectManager,
  type ProjectResourceLike,
  type ProjectScope,
} from "./components/ProjectManager";
import {
  NewConversationControl,
  ProjectHistorySidebar,
} from "./components/ProjectSidebar";
import { ToastRegion, useToasts } from "./components/ToastRegion";
import {
  type GlobalSearchTarget,
  globalSearchGroups,
  useGlobalSearch,
} from "./global-search";
import {
  asArray,
  desktopRequest,
  displayTimestamp,
  Icon,
  useApiResource,
} from "./lib";
import { shouldIgnoreShellShortcut } from "./shell-shortcuts";
import { workspacePathsEqual } from "./workspace-path";

const DashboardPage = lazy(() =>
  import("./DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const ChatPage = lazy(() =>
  import("./ChatPage").then((module) => ({ default: module.ChatPage })),
);
const CodingWorkspacePage = lazy(() =>
  import("./CodingWorkspacePage").then((module) => ({
    default: module.CodingWorkspacePage,
  })),
);
const BrowserPage = lazy(() =>
  import("./BrowserPage").then((module) => ({ default: module.BrowserPage })),
);
const GatewayPage = lazy(() =>
  import("./GatewayPage").then((module) => ({ default: module.GatewayPage })),
);
const ReviewPage = lazy(() =>
  import("./ReviewPage").then((module) => ({ default: module.ReviewPage })),
);
const OrchestrationPage = lazy(() =>
  import("./OrchestrationPage").then((module) => ({
    default: module.OrchestrationPage,
  })),
);
const SessionsPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.SessionsPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("./WorkspacePages").then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const ActivityPage = lazy(() =>
  import("./StudioPages").then((module) => ({
    default: module.ActivityPage,
  })),
);
const MediaPage = lazy(() =>
  import("./StudioPages").then((module) => ({ default: module.MediaPage })),
);
const MemoryPage = lazy(() =>
  import("./StudioPages").then((module) => ({ default: module.MemoryPage })),
);
const ModelsPage = lazy(() =>
  import("./AgentPages").then((module) => ({ default: module.ModelsPage })),
);
const ConnectionsPage = lazy(() =>
  import("./AgentPages").then((module) => ({
    default: module.ConnectionsPage,
  })),
);
const ToolsPage = lazy(() =>
  import("./AgentPages").then((module) => ({ default: module.ToolsPage })),
);
const SkillsPage = lazy(() =>
  import("./AgentPages").then((module) => ({ default: module.SkillsPage })),
);
const PluginsPage = lazy(() =>
  import("./AgentPages").then((module) => ({ default: module.PluginsPage })),
);
const ProfilesPage = lazy(() =>
  import("./AgentPages").then((module) => ({ default: module.ProfilesPage })),
);
const AutomationsPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.AutomationsPage,
  })),
);
const LogsPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.LogsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.SettingsPage,
  })),
);
const KeysPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.KeysPage,
  })),
);
const DocsPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.DocsPage,
  })),
);
const RuntimePage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.RuntimePage,
  })),
);
const CompatibilityPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.CompatibilityPage,
  })),
);
const RegistryPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.RegistryPage,
  })),
);
const SetupPage = lazy(() =>
  import("./ManagementPages").then((module) => ({
    default: module.SetupPage,
  })),
);

export type View =
  | "dashboard"
  | "chat"
  | "code"
  | "browser"
  | "gateway"
  | "review"
  | "orchestration"
  | "sessions"
  | "activity"
  | "analytics"
  | "media"
  | "models"
  | "connections"
  | "tools"
  | "skills"
  | "plugins"
  | "memory"
  | "automations"
  | "profiles"
  | "logs"
  | "keys"
  | "settings"
  | "docs"
  | "runtime"
  | "compatibility"
  | "registry"
  | "operatorSetup";

const views = new Set<View>([
  "dashboard",
  "chat",
  "code",
  "browser",
  "gateway",
  "review",
  "orchestration",
  "sessions",
  "activity",
  "analytics",
  "media",
  "models",
  "connections",
  "tools",
  "skills",
  "plugins",
  "memory",
  "automations",
  "profiles",
  "logs",
  "keys",
  "settings",
  "docs",
  "runtime",
  "compatibility",
  "registry",
  "operatorSetup",
]);

const navigation: Array<{
  id: "workspace" | "create" | "observe" | "agent" | "manage";
  label: string;
  items: Array<{ id: View; label: string }>;
}> = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Home" },
      { id: "chat", label: "Chat" },
      { id: "code", label: "Code" },
      { id: "browser", label: "Browser & preview" },
      { id: "review", label: "Review" },
      { id: "orchestration", label: "Tasks & agents" },
    ],
  },
  {
    id: "create",
    label: "Create",
    items: [
      { id: "media", label: "Media studio" },
      { id: "automations", label: "Automations" },
    ],
  },
  {
    id: "observe",
    label: "Observe",
    items: [
      { id: "sessions", label: "Sessions" },
      { id: "gateway", label: "Gateway inbox" },
      { id: "activity", label: "Activity" },
      { id: "analytics", label: "Analytics" },
    ],
  },
  {
    id: "agent",
    label: "Agent",
    items: [
      { id: "models", label: "Models" },
      { id: "connections", label: "Connections" },
      { id: "tools", label: "Tools" },
      { id: "skills", label: "Skills" },
      { id: "plugins", label: "Plugins" },
      { id: "memory", label: "Memory" },
      { id: "profiles", label: "Profiles" },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    items: [
      { id: "logs", label: "Logs" },
      { id: "settings", label: "Settings" },
      { id: "keys", label: "Keys" },
      { id: "runtime", label: "Runtime" },
      { id: "compatibility", label: "Compatibility" },
      { id: "registry", label: "Registry" },
      { id: "operatorSetup", label: "Setup" },
      { id: "docs", label: "About" },
    ],
  },
];

type NavigationSectionId = (typeof navigation)[number]["id"];

const VIEW_DESCRIPTIONS: Record<View, string> = {
  dashboard: "See runtime health, active work, and next operator actions",
  chat: "Start or continue a conversation",
  code: "Inspect files, changes, commits, worktrees, and terminal history",
  browser: "Preview localhost apps and capture browser evidence",
  gateway: "Inspect recorded gateway messages and replay an inbound record",
  review: "Approve decisions and inspect workspace changes and agent outputs",
  orchestration: "Direct tasks, agents, plans, and code generation runs",
  sessions: "Search and inspect conversation history",
  activity: "Review deliveries, commands, and runtime events",
  analytics: "Understand local usage and activity",
  media: "Analyze, transcribe, speak, and generate",
  models: "Choose models and inference providers",
  connections: "Connect provider accounts",
  tools: "Inspect callable tools",
  skills: "Browse installed agent skills",
  plugins: "Inspect the ElizaOS plugin runtime",
  memory: "Review local agent and user memory",
  automations: "Schedule recurring agent work",
  profiles: "Shape identity and personality",
  logs: "Trace runtime behavior",
  keys: "Manage local provider credentials",
  settings: "Configure Doolittle",
  docs: "Learn how the desktop works",
  runtime: "Inspect local runtime health",
  compatibility: "Verify SDK compatibility",
  registry: "Explore the capability registry",
  operatorSetup: "Complete local setup",
};

const DEFAULT_OPEN_SECTIONS: NavigationSectionId[] = ["workspace", "create"];
const NAV_SECTIONS_KEY = "doolittle.desktop.nav-sections.v1";
const NAV_COLLAPSED_KEY = "doolittle.desktop.nav-collapsed.v1";
const MOBILE_SIDEBAR_QUERY = "(max-width: 940px)";
const PROJECT_SCOPE_KEY = "doolittle.desktop.project-scope.v1";
const PROJECT_SWITCH_DEBOUNCE_MS = 120;
const PRIMARY_NAV_ITEMS = [
  { id: "chat" as const, label: "Chat", description: "Conversations" },
  { id: "code" as const, label: "Code", description: "Workspace" },
  {
    id: "orchestration" as const,
    label: "Tasks",
    description: "Agents and tasks",
  },
  { id: "review" as const, label: "Review", description: "Approvals" },
];

function loadOpenSections(): Set<NavigationSectionId> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(NAV_SECTIONS_KEY) ?? "null",
    ) as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_OPEN_SECTIONS);
    const valid = parsed.filter((id): id is NavigationSectionId =>
      navigation.some((section) => section.id === id),
    );
    return new Set(valid.length ? valid : DEFAULT_OPEN_SECTIONS);
  } catch {
    return new Set(DEFAULT_OPEN_SECTIONS);
  }
}

function loadProjectScope(): ProjectScope {
  const stored = localStorage.getItem(PROJECT_SCOPE_KEY)?.trim();
  return stored || "all";
}

function viewFromHash(): View {
  const value = window.location.hash.replace(/^#\/?/u, "") as View;
  return views.has(value) ? value : "chat";
}

function newConversationId(): string {
  return `desktop:${crypto.randomUUID()}`;
}

function workspaceName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? "Local workspace";
}

function pathsEqual(left: string | undefined, right: string): boolean {
  return workspacePathsEqual(left, right, window.doolittle.platform);
}

function collectSidebarFocusables(scope: HTMLElement | null): HTMLElement[] {
  if (!scope) return [];
  return Array.from(
    scope.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]',
    ),
  ).filter((element) => {
    if (
      element.hasAttribute("hidden") ||
      element.getAttribute("disabled") !== null
    ) {
      return false;
    }
    return element.tabIndex !== -1;
  });
}

function sessionLabel(session: SessionSummary): string {
  return session.title?.trim() || session.preview[0]?.trim() || "Conversation";
}

function RouteLoadingFallback() {
  return (
    <div aria-live="polite" className="loading-block" role="status">
      <i aria-hidden="true" />
      <span>Opening workspace…</span>
    </div>
  );
}

interface ApprovalListResponse {
  approvals?: unknown[];
}

interface DelegationTasksResponse {
  tasks?: unknown[];
}

export function App() {
  const initialConversation = useMemo(newConversationId, []);
  const [view, setViewState] = useState<View>(viewFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) === "true",
  );
  const [openSections, setOpenSections] =
    useState<Set<NavigationSectionId>>(loadOpenSections);
  const [backend, setBackend] = useState<BackendState>({
    phase: "booting",
    message: "Connecting to the local runtime…",
  });
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectScope, setProjectScope] =
    useState<ProjectScope>(loadProjectScope);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [newConversationMenuOpen, setNewConversationMenuOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    currentPath: "",
    recentPaths: [],
  });
  const [selectedSession, setSelectedSession] = useState(initialConversation);
  const [globalError, setGlobalError] = useState("");
  const [appearance, setAppearance] = useState<"dark" | "light">(() =>
    localStorage.getItem("doolittle.desktop.appearance") === "light"
      ? "light"
      : "dark",
  );
  const {
    toasts,
    push: pushToast,
    dismiss: dismissToast,
    pause: pauseToast,
    resume: resumeToast,
  } = useToasts({ maxVisible: 3, defaultTimeoutMs: 4_500 });
  const approvalsResource = useApiResource<ApprovalListResponse>(
    backend.phase === "ready" ? "/execution/approvals?status=pending" : null,
    [backend.phase],
  );
  const tasksResource = useApiResource<DelegationTasksResponse>(
    backend.phase === "ready"
      ? "/delegation/tasks?status=running&limit=20"
      : null,
    [backend.phase],
  );
  const activityResource = useApiResource<ActivityFeedResponse>(
    backend.phase === "ready" ? "/activity?limit=50" : null,
    [backend.phase],
  );
  const appMainRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
  const utilityRef = useRef<HTMLElement | null>(null);
  const utilityReturnFocusRef = useRef<HTMLElement | null>(null);
  const projectTransitionRef = useRef(0);
  const pendingProjectScopeRef = useRef<ProjectScope | null>(null);
  const [isMobileSidebarMode, setIsMobileSidebarMode] = useState(
    () => window.matchMedia(MOBILE_SIDEBAR_QUERY).matches,
  );
  const mobileSidebarOpen = sidebarOpen && isMobileSidebarMode;
  const mobileSidebarDialogProps = mobileSidebarOpen
    ? ({ "aria-modal": true, role: "dialog" } as const)
    : {};

  const setMobileSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpen(open);
    if (!open) {
      const restoreTarget = sidebarReturnFocusRef.current;
      if (restoreTarget?.isConnected) {
        requestAnimationFrame(() => restoreTarget.focus());
      }
      sidebarReturnFocusRef.current = null;
    }
  }, []);

  const openProjectManager = useCallback(() => {
    setMobileSidebarOpen(false);
    setProjectManagerOpen(true);
  }, [setMobileSidebarOpen]);

  const closeUtilities = useCallback(() => {
    setUtilityOpen(false);
    const restoreTarget = utilityReturnFocusRef.current;
    utilityReturnFocusRef.current = null;
    if (restoreTarget?.isConnected) {
      requestAnimationFrame(() => restoreTarget.focus());
    }
  }, []);

  const openUtilities = useCallback(() => {
    utilityReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMobileSidebarOpen(false);
    setUtilityOpen(true);
  }, [setMobileSidebarOpen]);

  const setView = useCallback(
    (next: View) => {
      setViewState(next);
      setMobileSidebarOpen(false);
      setUtilityOpen(false);
      const section = navigation.find((entry) =>
        entry.items.some((item) => item.id === next),
      );
      if (section) {
        setOpenSections((current) => {
          if (current.has(section.id)) return current;
          return new Set([...current, section.id]);
        });
      }
      window.location.hash = `/${next}`;
    },
    [setMobileSidebarOpen],
  );

  const openSidebarForMobile = useCallback(() => {
    setMobileSidebarOpen(true);
  }, [setMobileSidebarOpen]);

  const handleSidebarKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!mobileSidebarOpen || !isMobileSidebarMode) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setMobileSidebarOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = collectSidebarFocusables(sidebarRef.current);
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isMobileSidebarMode, mobileSidebarOpen, setMobileSidebarOpen],
  );

  const handleUtilityKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!utilityOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeUtilities();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = collectSidebarFocusables(utilityRef.current);
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeUtilities, utilityOpen],
  );

  const createConversation = useCallback(() => {
    if (isMobileSidebarMode) setMobileSidebarOpen(true);
    setNewConversationMenuOpen(true);
  }, [isMobileSidebarMode, setMobileSidebarOpen]);

  const toggleAppearance = useCallback(() => {
    const nextAppearance = appearance === "dark" ? "light" : "dark";
    setAppearance(nextAppearance);
    pushToast({
      tone: "success",
      title: `${nextAppearance === "dark" ? "Dark" : "Light"} appearance`,
      message: "Your desktop preference was saved.",
    });
  }, [appearance, pushToast]);

  const toggleNavigation = useCallback(() => {
    setNavCollapsed((value) => !value);
  }, []);

  const toggleInspector = useCallback(() => {
    window.dispatchEvent(new CustomEvent("doolittle:toggle-inspector"));
  }, []);

  const toggleSection = useCallback((id: NavigationSectionId) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const refreshRuntime = useCallback(async () => {
    if (backend.phase !== "ready") return false;
    setGlobalError("");
    let succeeded = true;
    const [runtimeResult, sessionsResult, projectsResult] =
      await Promise.allSettled([
        desktopRequest<RuntimeStatus>("/runtime/status"),
        desktopRequest<SessionsResponse>("/sessions?limit=200"),
        desktopRequest<ProjectsResponse>("/projects?includeArchived=true"),
      ]);
    if (runtimeResult.status === "fulfilled") {
      setRuntime(runtimeResult.value);
    } else {
      succeeded = false;
      setGlobalError(
        runtimeResult.reason instanceof Error
          ? runtimeResult.reason.message
          : String(runtimeResult.reason),
      );
    }
    if (sessionsResult.status === "fulfilled") {
      setSessions(sessionsResult.value.sessions);
    } else {
      succeeded = false;
      setGlobalError(
        sessionsResult.reason instanceof Error
          ? sessionsResult.reason.message
          : String(sessionsResult.reason),
      );
    }
    if (projectsResult.status === "fulfilled") {
      setProjects(projectsResult.value.projects);
    } else {
      succeeded = false;
      setGlobalError(
        projectsResult.reason instanceof Error
          ? projectsResult.reason.message
          : String(projectsResult.reason),
      );
    }
    return succeeded;
  }, [backend.phase]);

  const refreshWithFeedback = useCallback(async () => {
    const succeeded = await refreshRuntime();
    pushToast({
      tone: succeeded ? "success" : "error",
      title: succeeded ? "Workspace refreshed" : "Refresh incomplete",
      message: succeeded
        ? "Runtime and conversation state are up to date."
        : "Some local runtime data could not be loaded.",
    });
  }, [pushToast, refreshRuntime]);

  const restartRuntime = useCallback(async () => {
    try {
      const next = await window.doolittle.retryBackend();
      setBackend(next);
      pushToast({
        tone: next.phase === "ready" ? "success" : "warning",
        title:
          next.phase === "ready"
            ? "Runtime restarted"
            : "Runtime still offline",
        message: next.message,
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "Runtime restart failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [pushToast]);

  const switchToRecentWorkspace = useCallback(
    async (path: string, announce = true) => {
      try {
        const result = await window.doolittle.switchWorkspace(path);
        setWorkspace(result.state);
        if (announce) {
          pushToast({
            tone: "success",
            title: `Opened ${workspaceName(result.state.currentPath)}`,
            message:
              "Chats, Git, files, and tools now use this project. The runtime stayed connected.",
          });
        }
        return true;
      } catch (error) {
        pushToast({
          tone: "error",
          title: "Workspace could not be switched",
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [pushToast],
  );

  const reloadProjects = useCallback(async () => {
    const response = await desktopRequest<ProjectsResponse>(
      "/projects?includeArchived=true",
    );
    setProjects(response.projects);
    return response.projects;
  }, []);

  const activateProjectWorkspace = useCallback(
    async (scope: ProjectScope): Promise<boolean> => {
      const project =
        scope === "all" || scope === "unscoped"
          ? undefined
          : projects.find((entry) => entry.id === scope);
      if (
        project?.primaryPath &&
        !pathsEqual(project.primaryPath, workspace.currentPath)
      ) {
        if (
          workspace.recentPaths.some((path) =>
            pathsEqual(path, project.primaryPath as string),
          )
        ) {
          return switchToRecentWorkspace(project.primaryPath, false);
        } else {
          pushToast({
            tone: "warning",
            title: "Project folder needs approval",
            message:
              "Open this folder once with the native workspace picker before Doolittle can switch to it automatically.",
          });
          return false;
        }
      }
      return true;
    },
    [
      projects,
      pushToast,
      switchToRecentWorkspace,
      workspace.currentPath,
      workspace.recentPaths,
    ],
  );

  const transitionToProjectScope = useCallback(
    (scope: ProjectScope, sessionId: string) => {
      const transition = projectTransitionRef.current + 1;
      projectTransitionRef.current = transition;
      pendingProjectScopeRef.current = scope;
      const project =
        scope === "all" || scope === "unscoped"
          ? undefined
          : projects.find((entry) => entry.id === scope);
      const needsWorkspaceSwitch =
        Boolean(project?.primaryPath) &&
        !pathsEqual(project?.primaryPath, workspace.currentPath);
      const activate = () => {
        if (projectTransitionRef.current !== transition) return;
        void activateProjectWorkspace(scope).then((activated) => {
          if (projectTransitionRef.current !== transition) return;
          pendingProjectScopeRef.current = null;
          if (!activated) return;
          setProjectScope(scope);
          setSelectedSession(sessionId);
          setView("chat");
        });
      };
      if (needsWorkspaceSwitch) {
        window.setTimeout(activate, PROJECT_SWITCH_DEBOUNCE_MS);
      } else {
        activate();
      }
    },
    [activateProjectWorkspace, projects, setView, workspace.currentPath],
  );

  const selectProjectScope = useCallback(
    (scope: ProjectScope) => {
      const matches = sessions
        .filter((session) =>
          scope === "all"
            ? true
            : scope === "unscoped"
              ? !session.projectId
              : session.projectId === scope,
        )
        .sort((left, right) =>
          (right.endedAt ?? right.startedAt ?? "").localeCompare(
            left.endedAt ?? left.startedAt ?? "",
          ),
        );
      transitionToProjectScope(
        scope,
        matches.at(0)?.sessionId ?? newConversationId(),
      );
    },
    [sessions, transitionToProjectScope],
  );

  const startConversation = useCallback(
    (scope: ProjectScope) => {
      setNewConversationMenuOpen(false);
      transitionToProjectScope(scope, newConversationId());
    },
    [transitionToProjectScope],
  );

  const createProject = useCallback(
    async (draft: ProjectDraft) => {
      const response = await desktopRequest<ProjectResponse>(
        "/projects",
        "POST",
        {
          ...draft,
          primaryPath: workspace.currentPath || undefined,
        },
      );
      await reloadProjects();
      setProjectScope(response.project.id);
      setSelectedSession(newConversationId());
      setView("chat");
      pushToast({
        tone: "success",
        title: `${response.project.name} created`,
        message: workspace.currentPath
          ? "New chats now use this project and its current workspace."
          : "Add a folder when you are ready to give this project local context.",
      });
    },
    [pushToast, reloadProjects, setView, workspace.currentPath],
  );

  const chooseRepositoryForConversation = useCallback(async () => {
    try {
      const result = await window.doolittle.pickWorkspace();
      setWorkspace(result.state);
      if (result.canceled || !result.state.currentPath) return;

      const repositoryPath = result.state.currentPath;
      let project = projects.find(
        (entry) =>
          pathsEqual(entry.primaryPath, repositoryPath) ||
          entry.resources.some(
            (resource) =>
              resource.kind === "folder" &&
              pathsEqual(resource.value, repositoryPath),
          ),
      );

      if (project?.archivedAt) {
        const restored = await desktopRequest<ProjectResponse>(
          `/projects/${encodeURIComponent(project.id)}/archive`,
          "POST",
          { archived: false },
        );
        project = restored.project;
      }

      if (!project) {
        const created = await desktopRequest<ProjectResponse>(
          "/projects",
          "POST",
          {
            name: workspaceName(repositoryPath),
            description: "Local repository workspace",
            color: "#ff6a00",
            primaryPath: repositoryPath,
          },
        );
        project = created.project;
      }

      const selectedProject = project;
      setProjects((current) => [
        ...current.filter((entry) => entry.id !== selectedProject.id),
        selectedProject,
      ]);
      startConversation(selectedProject.id);
      pushToast({
        tone: "success",
        title: `Ready in ${selectedProject.name}`,
        message: "This conversation is linked to the selected repository.",
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "Repository could not be opened",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [projects, pushToast, startConversation]);

  const updateProject = useCallback(
    async (project: ProjectLike, draft: ProjectDraft) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}`,
        "PATCH",
        draft,
      );
      setProjects((current) =>
        current.map((entry) =>
          entry.id === response.project.id ? response.project : entry,
        ),
      );
      pushToast({
        tone: "success",
        title: `${response.project.name} updated`,
        message: "Project context and instructions were saved locally.",
      });
    },
    [pushToast],
  );

  const archiveProject = useCallback(
    async (project: ProjectLike, archived: boolean) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}/archive`,
        "POST",
        { archived },
      );
      setProjects((current) =>
        current.map((entry) =>
          entry.id === response.project.id ? response.project : entry,
        ),
      );
      if (archived && projectScope === project.id) {
        selectProjectScope("all");
      }
      pushToast({
        tone: "success",
        title: archived ? "Project archived" : "Project restored",
        message: `${response.project.name} ${
          archived ? "is hidden from active projects" : "is active again"
        }.`,
      });
    },
    [projectScope, pushToast, selectProjectScope],
  );

  const pinProject = useCallback(
    async (project: ProjectLike, pinned: boolean) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}`,
        "PATCH",
        { pinned },
      );
      setProjects((current) =>
        current.map((entry) =>
          entry.id === response.project.id ? response.project : entry,
        ),
      );
    },
    [],
  );

  const addProjectResources = useCallback(
    async (project: ProjectLike, kind: "file" | "folder") => {
      const selection =
        kind === "file"
          ? await window.doolittle.pickProjectFiles()
          : await window.doolittle.pickProjectFolders();
      if (selection.canceled || selection.paths.length === 0) return;
      for (const path of selection.paths) {
        await desktopRequest(
          `/projects/${encodeURIComponent(project.id)}/resources`,
          "POST",
          {
            kind,
            label: workspaceName(path),
            value: path,
          },
        );
      }
      const storedProject = projects.find((entry) => entry.id === project.id);
      if (kind === "folder" && !storedProject?.primaryPath) {
        await desktopRequest<ProjectResponse>(
          `/projects/${encodeURIComponent(project.id)}`,
          "PATCH",
          { primaryPath: selection.paths[0] },
        );
      }
      await reloadProjects();
      pushToast({
        tone: "success",
        title: `${selection.paths.length} ${
          kind === "file" ? "file" : "folder"
        }${selection.paths.length === 1 ? "" : "s"} added`,
        message: `Doolittle can now use ${
          selection.paths.length === 1 ? "this source" : "these sources"
        } as ${project.name} context.`,
      });
    },
    [projects, pushToast, reloadProjects],
  );

  const removeProjectResource = useCallback(
    async (project: ProjectLike, resource: ProjectResourceLike) => {
      await desktopRequest(
        `/projects/${encodeURIComponent(project.id)}/resources/${encodeURIComponent(
          resource.id,
        )}`,
        "DELETE",
      );
      await reloadProjects();
    },
    [reloadProjects],
  );

  const setProjectPrimaryPath = useCallback(
    async (project: ProjectLike, primaryPath: string) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}`,
        "PATCH",
        { primaryPath },
      );
      setProjects((current) =>
        current.map((entry) =>
          entry.id === response.project.id ? response.project : entry,
        ),
      );
      const canSwitch = workspace.recentPaths.some((path) =>
        pathsEqual(path, primaryPath),
      );
      if (!pathsEqual(primaryPath, workspace.currentPath) && canSwitch) {
        await switchToRecentWorkspace(primaryPath);
      }
      pushToast({
        tone: canSwitch ? "success" : "warning",
        title: `${workspaceName(primaryPath)} is primary`,
        message: canSwitch
          ? "New chats, Git operations, and project discovery now start from this folder."
          : "The project was updated. Open this folder once as a workspace before Doolittle can switch the private runtime automatically.",
      });
    },
    [
      pushToast,
      switchToRecentWorkspace,
      workspace.currentPath,
      workspace.recentPaths,
    ],
  );

  const moveCurrentChat = useCallback(
    async (projectId: string | null) => {
      await desktopRequest("/sessions/project", "POST", {
        sessionId: selectedSession,
        projectId,
      });
      setSessions((current) =>
        current.map((session) =>
          session.sessionId === selectedSession
            ? { ...session, projectId: projectId ?? undefined }
            : session,
        ),
      );
      transitionToProjectScope(projectId ?? "unscoped", selectedSession);
      pushToast({
        tone: "success",
        title: "Conversation moved",
        message: projectId
          ? "This chat now uses the selected project context."
          : "This chat is now unscoped.",
      });
    },
    [pushToast, selectedSession, transitionToProjectScope],
  );

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    localStorage.setItem("doolittle.desktop.appearance", appearance);
  }, [appearance]);

  useEffect(() => {
    localStorage.setItem(PROJECT_SCOPE_KEY, projectScope);
  }, [projectScope]);

  useEffect(() => {
    if (
      projectScope !== "all" &&
      projectScope !== "unscoped" &&
      projects.length > 0 &&
      !projects.some(
        (project) => project.id === projectScope && !project.archivedAt,
      )
    ) {
      setProjectScope("all");
    }
  }, [projectScope, projects]);

  useEffect(() => {
    if (
      backend.phase !== "ready" ||
      pendingProjectScopeRef.current !== null ||
      projectScope === "all" ||
      projectScope === "unscoped"
    ) {
      return;
    }
    const project = projects.find(
      (entry) => entry.id === projectScope && !entry.archivedAt,
    );
    const projectPath = project?.primaryPath;
    if (
      !projectPath ||
      pathsEqual(projectPath, workspace.currentPath) ||
      !workspace.recentPaths.some((path) => pathsEqual(path, projectPath))
    ) {
      return;
    }
    void switchToRecentWorkspace(projectPath);
  }, [
    backend.phase,
    projectScope,
    projects,
    switchToRecentWorkspace,
    workspace.currentPath,
    workspace.recentPaths,
  ]);

  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSED_KEY, String(navCollapsed));
  }, [navCollapsed]);

  useEffect(() => {
    localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify([...openSections]));
  }, [openSections]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const updateMobileMode = () => {
      setIsMobileSidebarMode(mediaQuery.matches);
    };
    updateMobileMode();
    mediaQuery.addEventListener("change", updateMobileMode);
    return () => mediaQuery.removeEventListener("change", updateMobileMode);
  }, []);

  useEffect(() => {
    if (!utilityOpen) return;
    requestAnimationFrame(() => {
      const [first] = collectSidebarFocusables(utilityRef.current);
      (first || utilityRef.current)?.focus();
    });
  }, [utilityOpen]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const appMain = appMainRef.current;
    if (!sidebar || !appMain) return;
    if (!isMobileSidebarMode) {
      sidebar.removeAttribute("inert");
      appMain.removeAttribute("inert");
      appMain.removeAttribute("aria-hidden");
      return;
    }

    if (mobileSidebarOpen) {
      sidebarReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      sidebar.removeAttribute("inert");
      appMain.setAttribute("inert", "");
      appMain.setAttribute("aria-hidden", "true");
      requestAnimationFrame(() => {
        const [first] = collectSidebarFocusables(sidebar);
        (first || sidebar).focus();
      });
      return;
    }

    sidebar.setAttribute("inert", "");
    appMain.removeAttribute("inert");
    appMain.removeAttribute("aria-hidden");
    const returnTarget = sidebarReturnFocusRef.current;
    if (returnTarget?.isConnected) {
      requestAnimationFrame(() => returnTarget.focus());
    }
    sidebarReturnFocusRef.current = null;
  }, [isMobileSidebarMode, mobileSidebarOpen]);

  useEffect(() => {
    const onHashChange = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "/chat";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (shouldIgnoreShellShortcut(event)) return;
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setView("settings");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createConversation();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        toggleNavigation();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        event.key.toLowerCase() === "i"
      ) {
        event.preventDefault();
        toggleInspector();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        setView("logs");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createConversation, setView, toggleInspector, toggleNavigation]);

  useEffect(
    () =>
      window.doolittle.onAppCommand((command) => {
        switch (command) {
          case "new-chat":
            createConversation();
            break;
          case "command-palette":
            setPaletteOpen(true);
            break;
          case "settings":
            setView("settings");
            break;
          case "toggle-sidebar":
            toggleNavigation();
            break;
          case "toggle-inspector":
            toggleInspector();
            break;
        }
      }),
    [createConversation, setView, toggleInspector, toggleNavigation],
  );

  useEffect(() => {
    void window.doolittle.getBackendState().then(setBackend);
    return window.doolittle.onBackendState(setBackend);
  }, []);

  useEffect(() => {
    void window.doolittle.getWorkspaceState().then(setWorkspace);
    return window.doolittle.onWorkspaceState(setWorkspace);
  }, []);

  useEffect(() => {
    if (backend.phase === "ready") {
      void refreshRuntime();
    } else {
      setRuntime(null);
    }
  }, [backend.phase, refreshRuntime]);

  useEffect(() => {
    if (backend.phase !== "ready") return;
    const interval = window.setInterval(() => {
      activityResource.reload();
      approvalsResource.reload();
      tasksResource.reload();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [
    activityResource.reload,
    approvalsResource.reload,
    backend.phase,
    tasksResource.reload,
  ]);

  const openSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((entry) => entry.sessionId === sessionId);
      transitionToProjectScope(
        session ? (session.projectId ?? "unscoped") : projectScope,
        sessionId,
      );
    },
    [projectScope, sessions, transitionToProjectScope],
  );

  const openActivityTarget = useCallback(
    (event: ActivityEvent) => {
      closeUtilities();
      if (event.target === "chat") {
        if (event.sessionId) openSession(event.sessionId);
        else setView("chat");
        return;
      }
      setView(event.target);
    },
    [closeUtilities, openSession, setView],
  );

  const openChatWithContext = useCallback(
    (text: string) => {
      const context = text.trim();
      if (!context) return;
      setView("chat");
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("doolittle:insert-chat-context", {
            detail: { text: context },
          }),
        );
      }, 0);
    },
    [setView],
  );

  const globalSearch = useGlobalSearch(
    paletteQuery,
    paletteOpen && backend.phase === "ready",
  );
  const selectGlobalSearchResult = useCallback(
    (target: GlobalSearchTarget) => {
      switch (target.kind) {
        case "conversation":
          openSession(target.sessionId);
          break;
        case "project":
          selectProjectScope(target.projectId);
          break;
        case "projectSource":
          selectProjectScope(target.projectId);
          setProjectManagerOpen(true);
          break;
        case "workspace":
          setView("code");
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("doolittle:open-workspace-file", {
                detail: { path: target.path },
              }),
            );
          }, 0);
          break;
        case "task":
          setView("orchestration");
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("doolittle:select-orchestration-task", {
                detail: { taskId: target.taskId },
              }),
            );
          }, 0);
          break;
        case "log":
          setView("logs");
          break;
      }
    },
    [openSession, selectProjectScope, setView],
  );

  const searchCommandGroups = useMemo<CommandGroup[]>(() => {
    const groups = globalSearchGroups(
      globalSearch.results,
      selectGlobalSearchResult,
    );
    if (paletteQuery.trim().length < 2) return groups;
    if (globalSearch.loading || globalSearch.error) {
      groups.unshift({
        id: "search-state",
        label: "Local search",
        items: [
          {
            id: globalSearch.loading ? "searching" : "partial-error",
            label: globalSearch.loading
              ? "Searching local workspace…"
              : "Some search sources are unavailable",
            description:
              globalSearch.error ||
              "Searching projects, sources, conversations, code, tasks, and logs.",
            keywords: [paletteQuery],
            disabled: true,
          },
        ],
      });
    }
    return groups;
  }, [
    globalSearch.error,
    globalSearch.loading,
    globalSearch.results,
    paletteQuery,
    selectGlobalSearchResult,
  ]);

  const activeSection = navigation.find((section) =>
    section.items.some((item) => item.id === view),
  );
  const activeItem = activeSection?.items.find((item) => item.id === view);
  const pendingApprovals = asArray(approvalsResource.data?.approvals).length;
  const runningTasks = asArray(tasksResource.data?.tasks).length;
  const activeProject =
    projectScope === "all" || projectScope === "unscoped"
      ? null
      : (projects.find((project) => project.id === projectScope) ?? null);
  const scopedSessions = useMemo(
    () =>
      sessions.filter((session) =>
        projectScope === "all"
          ? true
          : projectScope === "unscoped"
            ? !session.projectId
            : session.projectId === projectScope,
      ),
    [projectScope, sessions],
  );
  const projectCards = useMemo<ProjectLike[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        color: project.color,
        icon: project.icon,
        primaryPath: project.primaryPath,
        pinned: project.pinned,
        archived: Boolean(project.archivedAt),
        chatCount: sessions.filter(
          (session) => session.projectId === project.id,
        ).length,
        resources: project.resources
          .filter(
            (resource) =>
              resource.kind === "file" || resource.kind === "folder",
          )
          .map((resource) => ({
            id: resource.id,
            kind: resource.kind as "file" | "folder",
            path: resource.value,
            label: resource.label,
            createdAt: resource.createdAt,
          })),
        updatedAt: project.updatedAt,
      })),
    [projects, sessions],
  );
  const projectLabels = useMemo(
    () =>
      Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const unscopedChatCount = sessions.filter(
    (session) => !session.projectId,
  ).length;
  const selectedSessionProjectId =
    sessions.find((session) => session.sessionId === selectedSession)
      ?.projectId ??
    activeProject?.id ??
    null;
  const sidebarSessions = useMemo(() => {
    const items = [...scopedSessions]
      .sort((left, right) =>
        (right.endedAt ?? right.startedAt ?? "").localeCompare(
          left.endedAt ?? left.startedAt ?? "",
        ),
      )
      .slice(0, 5);
    if (
      selectedSession &&
      !items.some((entry) => entry.sessionId === selectedSession)
    ) {
      items.unshift({
        sessionId: selectedSession,
        title: "Current draft",
        messageCount: 0,
        participants: ["user"],
        preview: ["New local conversation"],
      });
    }
    return items.slice(0, 5);
  }, [scopedSessions, selectedSession]);

  const commandGroups = useMemo<CommandGroup[]>(
    () => [
      ...(paletteQuery.trim()
        ? []
        : [
            {
              id: "recents",
              label: "Recents",
              items: [
                ...sidebarSessions.map((session) => ({
                  id: `recent-${session.sessionId}`,
                  label: sessionLabel(session),
                  description:
                    session.messageCount > 0
                      ? `${session.messageCount} messages · ${
                          session.endedAt
                            ? displayTimestamp(session.endedAt)
                            : "active locally"
                        }`
                      : "Draft conversation",
                  keywords: ["recent", "conversation", session.sessionId],
                  onSelect: () => openSession(session.sessionId),
                })),
                {
                  id: "recent-open-workspace",
                  label: "Choose repository for new chat",
                  description: workspace.currentPath || "Choose a local folder",
                  keywords: ["workspace", "open", "project", "repository"],
                  onSelect: () => void chooseRepositoryForConversation(),
                },
                ...workspace.recentPaths
                  .filter((path) => path !== workspace.currentPath)
                  .map((path) => ({
                    id: `workspace-${path}`,
                    label: workspaceName(path),
                    description: path,
                    keywords: ["workspace", "recent", "project", path],
                    onSelect: () => void switchToRecentWorkspace(path),
                  })),
                {
                  id: "recent-live-tasks",
                  label: "Open live tasks",
                  description:
                    runningTasks > 0
                      ? `${runningTasks} running task${
                          runningTasks === 1 ? "" : "s"
                        }`
                      : "No active tasks right now",
                  keywords: ["tasks", "agents", "running"],
                  onSelect: () => setView("orchestration"),
                },
              ],
            },
            {
              id: "projects",
              label: "Projects",
              items: [
                {
                  id: "project-all",
                  label: "All chats",
                  description: `${sessions.length} conversations across every project`,
                  keywords: ["projects", "global", "all chats"],
                  onSelect: () => selectProjectScope("all"),
                },
                ...projectCards
                  .filter((project) => !project.archived)
                  .map((project) => ({
                    id: `project-${project.id}`,
                    label: project.name,
                    description: `${project.chatCount ?? 0} conversations${
                      project.description ? ` · ${project.description}` : ""
                    }`,
                    keywords: [
                      "project",
                      project.name,
                      project.description ?? "",
                    ],
                    onSelect: () => selectProjectScope(project.id),
                  })),
                {
                  id: "project-manage",
                  label: "Manage projects",
                  description:
                    "Create, edit, archive, and attach local sources",
                  keywords: ["project", "files", "folders", "manage"],
                  onSelect: openProjectManager,
                },
              ],
            },
          ]),
      ...searchCommandGroups,
      {
        id: "actions",
        label: "Actions",
        items: [
          {
            id: "new-chat",
            label: "New conversation",
            description: "Start with a clean context",
            keywords: ["compose", "new", "chat"],
            shortcuts: [
              window.doolittle.platform === "darwin" ? "⌘ N" : "Ctrl N",
            ],
            onSelect: createConversation,
          },
          {
            id: "refresh",
            label: "Refresh local runtime",
            description: "Reload runtime and session state",
            keywords: ["reload", "health"],
            disabled: backend.phase !== "ready",
            onSelect: () => void refreshWithFeedback(),
          },
          {
            id: "open-workspace",
            label: "Choose repository for new chat",
            description:
              "Open a repo, link it to a project, and start chatting",
            keywords: ["project", "folder", "repository", "switch"],
            shortcuts: [
              window.doolittle.platform === "darwin" ? "⌘ O" : "Ctrl O",
            ],
            onSelect: () => void chooseRepositoryForConversation(),
          },
          {
            id: "appearance",
            label: `Use ${appearance === "dark" ? "light" : "dark"} appearance`,
            description: "Switch the desktop color mode",
            keywords: ["theme", "dark", "light"],
            onSelect: toggleAppearance,
          },
          {
            id: "navigation",
            label: `${navCollapsed ? "Expand" : "Collapse"} navigation`,
            description: "Change the sidebar density",
            shortcuts: [
              window.doolittle.platform === "darwin" ? "⌘ ⇧ B" : "Ctrl ⇧ B",
            ],
            onSelect: toggleNavigation,
          },
        ],
      },
      ...navigation.map((section) => ({
        id: section.id,
        label: section.label,
        items: section.items.map((item) => ({
          id: `view-${item.id}`,
          label: item.label,
          description: VIEW_DESCRIPTIONS[item.id],
          keywords: [section.label, item.id],
          onSelect: () => setView(item.id),
        })),
      })),
    ],
    [
      appearance,
      backend.phase,
      createConversation,
      chooseRepositoryForConversation,
      navCollapsed,
      openSession,
      openProjectManager,
      paletteQuery,
      refreshWithFeedback,
      runningTasks,
      searchCommandGroups,
      selectProjectScope,
      sessions.length,
      setView,
      sidebarSessions,
      projectCards,
      toggleAppearance,
      toggleNavigation,
      switchToRecentWorkspace,
      workspace.currentPath,
      workspace.recentPaths,
    ],
  );

  const content = (() => {
    switch (view) {
      case "dashboard":
        return (
          <DashboardPage
            active={backend.phase === "ready"}
            onOpenChat={(sessionId) => {
              if (sessionId) openSession(sessionId);
              else setView("chat");
            }}
            onOpenReview={() => setView("review")}
            onOpenSetup={() => setView("operatorSetup")}
            onOpenTasks={() => setView("orchestration")}
          />
        );
      case "chat":
        return (
          <ChatPage
            activeProject={activeProject}
            backend={backend}
            onOpenProjectManager={openProjectManager}
            onRequestNewConversation={createConversation}
            onSelect={setSelectedSession}
            onOpenModelsPage={() => setView("models")}
            onOpenWorkspaceView={setView}
            pendingApprovals={pendingApprovals}
            projectLabels={projectLabels}
            refreshRuntime={refreshRuntime}
            remoteSessions={scopedSessions}
            runningTasks={runningTasks}
            runtime={runtime}
            selectedId={selectedSession}
            workspacePath={workspace.currentPath}
          />
        );
      case "code":
        return (
          <CodingWorkspacePage
            active={backend.phase === "ready"}
            onSendToChat={openChatWithContext}
            workspacePath={workspace.currentPath}
          />
        );
      case "browser":
        return (
          <BrowserPage
            active={backend.phase === "ready"}
            onSendToChat={openChatWithContext}
          />
        );
      case "gateway":
        return <GatewayPage active={backend.phase === "ready"} />;
      case "review":
        return (
          <ReviewPage
            active={backend.phase === "ready"}
            onSendToChat={openChatWithContext}
          />
        );
      case "orchestration":
        return <OrchestrationPage active={backend.phase === "ready"} />;
      case "sessions":
        return (
          <SessionsPage
            active={backend.phase === "ready"}
            openChat={openSession}
            projectId={
              activeProject?.id ??
              (projectScope === "unscoped" ? null : undefined)
            }
            refresh={refreshRuntime}
            sessions={scopedSessions}
          />
        );
      case "activity":
        return <ActivityPage active={backend.phase === "ready"} />;
      case "analytics":
        return <AnalyticsPage active={backend.phase === "ready"} />;
      case "media":
        return <MediaPage active={backend.phase === "ready"} />;
      case "models":
        return (
          <ModelsPage
            active={backend.phase === "ready"}
            refreshRuntime={refreshRuntime}
            runtime={runtime}
          />
        );
      case "connections":
        return <ConnectionsPage active={backend.phase === "ready"} />;
      case "tools":
        return <ToolsPage active={backend.phase === "ready"} />;
      case "skills":
        return <SkillsPage active={backend.phase === "ready"} />;
      case "plugins":
        return <PluginsPage active={backend.phase === "ready"} />;
      case "memory":
        return <MemoryPage active={backend.phase === "ready"} />;
      case "automations":
        return <AutomationsPage active={backend.phase === "ready"} />;
      case "profiles":
        return <ProfilesPage active={backend.phase === "ready"} />;
      case "logs":
        return <LogsPage active={backend.phase === "ready"} />;
      case "settings":
        return <SettingsPage active={backend.phase === "ready"} />;
      case "keys":
        return <KeysPage active={backend.phase === "ready"} />;
      case "docs":
        return <DocsPage active={backend.phase === "ready"} />;
      case "runtime":
        return (
          <RuntimePage
            active={backend.phase === "ready" || backend.phase === "degraded"}
          />
        );
      case "compatibility":
        return (
          <CompatibilityPage
            active={backend.phase === "ready" || backend.phase === "degraded"}
          />
        );
      case "registry":
        return <RegistryPage active={backend.phase === "ready"} />;
      case "operatorSetup":
        return <SetupPage active={backend.phase === "ready"} />;
    }
  })();

  return (
    <main className={`desktop-shell ${navCollapsed ? "nav-collapsed" : ""}`}>
      <CommandPalette
        groups={commandGroups}
        isOpen={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteQuery("");
        }}
        onQueryChange={setPaletteQuery}
        resetOnOpen
        searchPlaceholder="Search projects, chats, files, tasks, logs, pages…"
        title="Go anywhere"
      />
      <ProjectManager
        activeScope={projectScope}
        allChatCount={sessions.length}
        currentChatId={selectedSession}
        currentChatProjectId={selectedSessionProjectId}
        isOpen={projectManagerOpen}
        onAddFiles={(project) => addProjectResources(project, "file")}
        onAddFolders={(project) => addProjectResources(project, "folder")}
        onArchiveProject={archiveProject}
        onClose={() => setProjectManagerOpen(false)}
        onCreateProject={createProject}
        onMoveCurrentChat={moveCurrentChat}
        onPinProject={pinProject}
        onRemoveResource={removeProjectResource}
        onSetPrimaryPath={setProjectPrimaryPath}
        onScopeChange={selectProjectScope}
        onUpdateProject={updateProject}
        projects={projectCards}
        unscopedChatCount={unscopedChatCount}
      />
      {utilityOpen ? (
        <div className="utility-layer">
          <button
            aria-label="Close tools and settings"
            className="utility-layer-dismiss"
            onClick={closeUtilities}
            type="button"
          />
          <aside
            aria-label="Tools and settings"
            aria-modal="true"
            className="utility-drawer"
            onKeyDown={handleUtilityKeyDown}
            ref={utilityRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="utility-drawer-header">
              <div>
                <span className="eyebrow">Doolittle workspace</span>
                <h2>Tools & settings</h2>
                <p>
                  Open a focused surface without leaving your current
                  conversation behind.
                </p>
              </div>
              <button
                aria-label="Close tools and settings"
                className="icon-button"
                onClick={closeUtilities}
                type="button"
              >
                ×
              </button>
            </header>
            <ActivityCenter
              active={backend.phase === "ready"}
              error={activityResource.error}
              events={activityResource.data?.events ?? []}
              loading={activityResource.loading}
              onOpenTarget={openActivityTarget}
              reload={activityResource.reload}
            />
            <nav
              aria-label="All Doolittle tools and settings"
              className="utility-navigation"
            >
              {navigation.map((section) => (
                <section className="utility-navigation-group" key={section.id}>
                  <button
                    aria-expanded={openSections.has(section.id)}
                    className="utility-navigation-heading"
                    onClick={() => toggleSection(section.id)}
                    type="button"
                  >
                    <span>{section.label}</span>
                    <i aria-hidden="true">
                      {openSections.has(section.id) ? "−" : "+"}
                    </i>
                  </button>
                  {openSections.has(section.id) ? (
                    <div className="utility-navigation-items">
                      {section.items.map((item) => (
                        <button
                          aria-current={view === item.id ? "page" : undefined}
                          className={view === item.id ? "selected" : ""}
                          key={item.id}
                          onClick={() => setView(item.id)}
                          type="button"
                        >
                          <Icon
                            name={item.id === "gateway" ? "activity" : item.id}
                          />
                          <span>
                            <strong>{item.label}</strong>
                            <small>{VIEW_DESCRIPTIONS[item.id]}</small>
                          </span>
                          <i aria-hidden="true">↗</i>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
      <ToastRegion
        onDismiss={dismissToast}
        onPause={pauseToast}
        onResume={resumeToast}
        toasts={toasts}
      />
      <button
        aria-label="Close navigation"
        className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
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
        onKeyDown={handleSidebarKeyDown}
        ref={sidebarRef}
      >
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
            onClick={toggleNavigation}
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
            onChooseRepository={chooseRepositoryForConversation}
            onManageProjects={openProjectManager}
            onOpenChange={setNewConversationMenuOpen}
            onStart={startConversation}
            projects={projectCards}
            shortcut={window.doolittle.platform === "darwin" ? "⌘N" : "Ctrl N"}
          />
          <button
            aria-label="Search pages and commands"
            onClick={() => setPaletteOpen(true)}
            type="button"
          >
            <span aria-hidden="true">⌕</span>
            <strong>Search and commands</strong>
            <kbd>
              {window.doolittle.platform === "darwin" ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>
          <button
            aria-label="Choose repository for a new conversation"
            onClick={() => void chooseRepositoryForConversation()}
            title={workspace.currentPath || "Choose a project folder"}
            type="button"
          >
            <span aria-hidden="true">◇</span>
            <strong>Choose repository</strong>
            <kbd>
              {window.doolittle.platform === "darwin" ? "⌘O" : "Ctrl O"}
            </kbd>
          </button>
        </div>
        <ProjectHistorySidebar
          activeScope={projectScope}
          isChatView={view === "chat"}
          onChooseRepository={chooseRepositoryForConversation}
          onManageProjects={openProjectManager}
          onOpenSession={openSession}
          onSelectScope={selectProjectScope}
          onStartConversation={startConversation}
          onViewAll={() => setView("sessions")}
          projects={projectCards}
          selectedSessionId={selectedSession}
          sessions={sessions}
        />
        <nav className="sidebar-focus-nav" aria-label="Primary workspace">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <button
              aria-current={view === item.id ? "page" : undefined}
              className={view === item.id ? "selected" : ""}
              key={item.id}
              onClick={() => setView(item.id)}
              title={navCollapsed ? item.label : item.description}
              type="button"
            >
              <Icon name={item.id} />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            aria-expanded={utilityOpen}
            className="sidebar-utility-button"
            onClick={openUtilities}
            title="Open every Doolittle tool and setting"
            type="button"
          >
            <Icon name="tools" />
            <span>Tools & settings</span>
            <i aria-hidden="true">⌘</i>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-actions">
            <button
              aria-label={`Use ${
                appearance === "dark" ? "light" : "dark"
              } appearance`}
              className="icon-button"
              onClick={toggleAppearance}
              title="Toggle appearance"
              type="button"
            >
              {appearance === "dark" ? "☼" : "◐"}
            </button>
            <button
              aria-label="Open settings"
              className="sidebar-account"
              onClick={() => setView("settings")}
              type="button"
            >
              <span>DL</span>
              <div>
                <strong>Settings</strong>
                <small title={workspace.currentPath}>
                  {workspaceName(workspace.currentPath)}
                </small>
              </div>
            </button>
          </div>
        </div>
      </aside>
      <section className="app-main" ref={appMainRef}>
        <div className="window-dragbar">
          <button
            aria-label="Open navigation"
            className="menu-button"
            onClick={openSidebarForMobile}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              viewBox="0 0 20 20"
              stroke="currentColor"
            >
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <div className="window-context">
            <span>{activeSection?.label ?? "Doolittle"}</span>
            <strong>{activeItem?.label ?? "Desktop"}</strong>
          </div>
          <div className="window-tools">
            <button
              aria-label="Open command palette"
              className="window-command-button"
              onClick={() => setPaletteOpen(true)}
              title="Search pages and commands"
              type="button"
            >
              <span>Search or jump to…</span>
              <kbd>
                {window.doolittle.platform === "darwin" ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>
            <button
              aria-label="Open tools and settings"
              aria-expanded={utilityOpen}
              className="window-utility-button"
              onClick={openUtilities}
              type="button"
            >
              Tools
            </button>
            <div
              className={`window-runtime-status ${backend.phase}`}
              title={backend.message}
            >
              <i />
              <span>
                {backend.phase === "ready"
                  ? "Local runtime"
                  : backend.phase === "booting"
                    ? "Starting"
                    : "Offline"}
              </span>
            </div>
            <button
              aria-label="Refresh runtime data"
              className="icon-button"
              onClick={() => void refreshWithFeedback()}
              title="Refresh runtime"
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                viewBox="0 0 20 20"
                stroke="currentColor"
              >
                <path d="M15.5 6.5V3m0 3.5H12M4.7 7.1A6 6 0 0 1 15.5 6.5M4.5 13.5V17m0-3.5H8m7.3-.6A6 6 0 0 1 4.5 13.5" />
              </svg>
            </button>
          </div>
        </div>
        {backend.phase === "degraded" ? (
          <div className="runtime-banner">
            <div>
              <strong>The local runtime is unavailable.</strong>
              <span>{backend.detail || backend.message}</span>
            </div>
            <button
              className="primary-button"
              onClick={() => void restartRuntime()}
              type="button"
            >
              Restart runtime
            </button>
          </div>
        ) : null}
        {globalError ? (
          <div className="global-error">
            <span>{globalError}</span>
            <button onClick={() => void refreshWithFeedback()} type="button">
              Retry
            </button>
          </div>
        ) : null}
        <div className={`view-container view-${view}`}>
          <Suspense fallback={<RouteLoadingFallback />}>{content}</Suspense>
        </div>
      </section>
    </main>
  );
}
