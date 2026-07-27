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
  BackendState,
  RuntimeStatus,
  SessionSummary,
  SessionsResponse,
  WorkspaceState,
} from "../shared/contracts";
import { type CommandGroup, CommandPalette } from "./components/CommandPalette";
import { ToastRegion, useToasts } from "./components/ToastRegion";
import {
  type GlobalSearchTarget,
  globalSearchGroups,
  useGlobalSearch,
} from "./global-search";
import {
  asArray,
  compactNumber,
  desktopRequest,
  displayTimestamp,
  Icon,
  useApiResource,
} from "./lib";

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
const QUICK_NAV_ITEMS = [
  { id: "dashboard" as const, label: "Dashboard", description: "Overview" },
  { id: "chat" as const, label: "Chat", description: "Conversations" },
  { id: "code" as const, label: "Code", description: "Workspace" },
  {
    id: "orchestration" as const,
    label: "Orchestrate",
    description: "Agents and tasks",
  },
  {
    id: "browser" as const,
    label: "Browser",
    description: "Previews",
  },
  { id: "models" as const, label: "Models", description: "Providers" },
  { id: "settings" as const, label: "Settings", description: "Configuration" },
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

function viewFromHash(): View {
  const value = window.location.hash.replace(/^#\/?/u, "") as View;
  return views.has(value) ? value : "dashboard";
}

function newConversationId(): string {
  return `desktop:${crypto.randomUUID()}`;
}

function workspaceName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? "Local workspace";
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
  const appMainRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
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

  const setView = useCallback(
    (next: View) => {
      setViewState(next);
      setMobileSidebarOpen(false);
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

  const createConversation = useCallback(() => {
    setSelectedSession(newConversationId());
    setView("chat");
  }, [setView]);

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
    const [runtimeResult, sessionsResult] = await Promise.allSettled([
      desktopRequest<RuntimeStatus>("/runtime/status"),
      desktopRequest<SessionsResponse>("/sessions?limit=200"),
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

  const openWorkspace = useCallback(async () => {
    try {
      const result = await window.doolittle.pickWorkspace();
      setWorkspace(result.state);
      if (!result.canceled) {
        pushToast({
          tone: "success",
          title: `Opened ${workspaceName(result.state.currentPath)}`,
          message: "The private runtime restarted in the selected workspace.",
        });
      }
    } catch (error) {
      pushToast({
        tone: "error",
        title: "Workspace could not be opened",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [pushToast]);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    localStorage.setItem("doolittle.desktop.appearance", appearance);
  }, [appearance]);

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
    if (!window.location.hash) window.location.hash = "/dashboard";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
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
      setSessions([]);
    }
  }, [backend.phase, refreshRuntime]);

  useEffect(() => {
    if (backend.phase !== "ready") return;
    const interval = window.setInterval(() => {
      approvalsResource.reload();
      tasksResource.reload();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [approvalsResource.reload, backend.phase, tasksResource.reload]);

  const openSession = useCallback(
    (sessionId: string) => {
      setSelectedSession(sessionId);
      setView("chat");
    },
    [setView],
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
    [openSession, setView],
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
              "Searching conversations, code, tasks, and logs.",
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
  const sidebarSessions = useMemo(() => {
    const items = [...sessions]
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
  }, [selectedSession, sessions]);

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
                  label: "Open workspace",
                  description:
                    workspace.currentPath || "Choose a project folder",
                  keywords: ["workspace", "open", "project"],
                  onSelect: () => void openWorkspace(),
                },
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
            label: "Open workspace",
            description:
              "Choose a project folder and restart the local runtime",
            keywords: ["project", "folder", "repository", "switch"],
            shortcuts: [
              window.doolittle.platform === "darwin" ? "⌘ O" : "Ctrl O",
            ],
            onSelect: () => void openWorkspace(),
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
      navCollapsed,
      openSession,
      openWorkspace,
      paletteQuery,
      refreshWithFeedback,
      runningTasks,
      searchCommandGroups,
      setView,
      sidebarSessions,
      toggleAppearance,
      toggleNavigation,
      workspace.currentPath,
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
            backend={backend}
            onSelect={setSelectedSession}
            onOpenModelsPage={() => setView("models")}
            onOpenWorkspaceView={setView}
            refreshRuntime={refreshRuntime}
            remoteSessions={sessions}
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
            openChat={openSession}
            refresh={refreshRuntime}
            sessions={sessions}
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
        searchPlaceholder="Search conversations, code, tasks, logs, pages…"
        title="Go anywhere"
      />
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
          <button
            aria-label="New conversation"
            onClick={createConversation}
            type="button"
          >
            <span aria-hidden="true">＋</span>
            <strong>New conversation</strong>
            <kbd>
              {window.doolittle.platform === "darwin" ? "⌘N" : "Ctrl N"}
            </kbd>
          </button>
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
            aria-label="Open workspace"
            onClick={() => void openWorkspace()}
            title={workspace.currentPath || "Choose a project folder"}
            type="button"
          >
            <span aria-hidden="true">◇</span>
            <strong>{workspaceName(workspace.currentPath)}</strong>
            <kbd>
              {window.doolittle.platform === "darwin" ? "⌘O" : "Ctrl O"}
            </kbd>
          </button>
        </div>
        <section className="sidebar-recents" aria-labelledby="sidebar-recents">
          <div className="sidebar-recents-heading">
            <span id="sidebar-recents">Recent conversations</span>
            <button
              className="text-button"
              onClick={() => setView("sessions")}
              type="button"
            >
              View all
            </button>
          </div>
          {sidebarSessions.length > 0 ? (
            <div className="sidebar-recents-list">
              {sidebarSessions.map((session) => {
                const isSelected =
                  view === "chat" && selectedSession === session.sessionId;
                return (
                  <button
                    aria-current={isSelected ? "true" : undefined}
                    className={`sidebar-recent-card ${
                      isSelected ? "selected" : ""
                    }`}
                    key={session.sessionId}
                    onClick={() => openSession(session.sessionId)}
                    type="button"
                  >
                    <strong>{sessionLabel(session)}</strong>
                    <span>
                      {session.messageCount > 0
                        ? `${session.messageCount} messages`
                        : "No messages yet"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="sidebar-recents-empty">
              New conversations appear here after the first local turn.
            </p>
          )}
        </section>
        <nav className="app-navigation" aria-label="Application">
          {navigation.map((section) => (
            <div
              className={`nav-section ${
                openSections.has(section.id) ? "open" : ""
              }`}
              key={section.id}
            >
              <button
                aria-expanded={openSections.has(section.id)}
                className="nav-section-toggle"
                onClick={() => toggleSection(section.id)}
                type="button"
              >
                <span>{section.label}</span>
                <i aria-hidden="true">⌄</i>
              </button>
              <div
                className="nav-section-items"
                hidden={!openSections.has(section.id)}
              >
                {section.items.map((item) => (
                  <button
                    aria-current={view === item.id ? "page" : undefined}
                    aria-label={item.label}
                    className={view === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => setView(item.id)}
                    title={navCollapsed ? item.label : undefined}
                    type="button"
                  >
                    <Icon name={item.id === "gateway" ? "activity" : item.id} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`runtime-indicator ${backend.phase}`}>
            <i />
            <div>
              <strong>
                {backend.phase === "ready"
                  ? "Runtime connected"
                  : backend.phase === "booting"
                    ? "Starting runtime"
                    : "Runtime unavailable"}
              </strong>
              <span>
                {backend.phase === "ready"
                  ? `${runtime?.provider ?? "Local"} · ${
                      runtime?.model ?? "Loading"
                    }`
                  : backend.message}
              </span>
            </div>
          </div>
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
                <strong>Operator</strong>
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
          <nav
            aria-label="Quick workspace navigation"
            className="window-quick-nav"
          >
            {QUICK_NAV_ITEMS.map((item) => (
              <button
                aria-current={view === item.id ? "page" : undefined}
                aria-label={item.label}
                className={`window-nav-chip ${view === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setView(item.id)}
                title={item.description}
                type="button"
              >
                <Icon name={item.id} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
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
        <div
          className="window-status-strip"
          role="toolbar"
          aria-label="Workspace status"
        >
          <button
            className="window-status-chip"
            onClick={() => void openWorkspace()}
            title={workspace.currentPath || "Choose a project folder"}
            type="button"
          >
            <span>Workspace</span>
            <strong>{workspaceName(workspace.currentPath)}</strong>
          </button>
          <button
            className="window-status-chip"
            onClick={() => setView("chat")}
            type="button"
          >
            <span>Conversations</span>
            <strong>{compactNumber(sessions.length)}</strong>
          </button>
          <button
            className={`window-status-chip ${runningTasks > 0 ? "active" : ""}`}
            onClick={() => setView("orchestration")}
            type="button"
          >
            <span>Live tasks</span>
            <strong>{compactNumber(runningTasks)}</strong>
          </button>
          <button
            className={`window-status-chip ${
              pendingApprovals > 0 ? "warning" : ""
            }`}
            onClick={() => setView("review")}
            type="button"
          >
            <span>Approvals</span>
            <strong>{compactNumber(pendingApprovals)}</strong>
          </button>
          <button
            className="window-status-chip route"
            onClick={() => setView("models")}
            type="button"
          >
            <span>Route</span>
            <strong>
              {runtime?.provider ?? "runtime"} · {runtime?.model ?? "loading"}
            </strong>
          </button>
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
