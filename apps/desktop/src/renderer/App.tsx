import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import {
  type CSSProperties,
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
  ThemeResponse,
  WorkspacePickResult,
  WorkspaceState,
} from "../shared/contracts";
import { DesktopMobileMenuButton } from "./app-shell/DesktopMobileMenuButton";
import {
  DesktopRouteContent,
  preloadDesktopRoute,
} from "./app-shell/DesktopRouteContent";
import { DesktopRouteLoadingFallback } from "./app-shell/DesktopRouteLoadingFallback";
import { DesktopRuntimeNotices } from "./app-shell/DesktopRuntimeNotices";
import { DesktopSidebar } from "./app-shell/DesktopSidebar";
import { DesktopUtilityLayer } from "./app-shell/DesktopUtilityLayer";
import { DesktopWindowContext } from "./app-shell/DesktopWindowContext";
import { DesktopWindowTools } from "./app-shell/DesktopWindowTools";
import { buildDesktopCommandGroups } from "./app-shell/desktop-command-groups";
import {
  type ChatContextHandoff,
  type ChatContextRequest,
  resolveChatContextProjectScope,
} from "./chat-context-handoff";
import { ActivityCenter } from "./components/ActivityCenter";
import { type CommandGroup, CommandPalette } from "./components/CommandPalette";
import { ProjectManager } from "./components/ProjectManager";
import { ToastRegion, useToasts } from "./components/ToastRegion";
import { newConversationId } from "./conversation-id";
import {
  collectSidebarFocusables,
  loadOpenSections,
  loadProjectScope,
  MOBILE_SIDEBAR_QUERY,
  NAV_COLLAPSED_KEY,
  NAV_SECTIONS_KEY,
  type NavigationSectionId,
  navigation,
  PROJECT_SCOPE_KEY,
  PROJECT_SWITCH_DEBOUNCE_MS,
  type View,
  viewFromHash,
  workspaceName,
} from "./desktop-navigation";
import {
  acknowledgeNavigationIntent,
  createOrchestrationTaskNavigationIntent,
  createWorkspaceFileNavigationIntent,
  type DesktopNavigationIntent,
} from "./desktop-navigation-intent";
import {
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopTheme,
  type DesktopAppearance,
  type DesktopDensity,
  loadAppearancePreference,
  loadDensityPreference,
  loadStoredDesktopTheme,
  parseDesktopThemeProfile,
  resolveAppearance,
  subscribeToDesktopThemeChanges,
} from "./desktop-theme";
import {
  type GlobalSearchTarget,
  globalSearchGroups,
  useGlobalSearch,
} from "./global-search";
import { asArray, desktopRequest, useApiResource } from "./lib";
import {
  APP_SIDEBAR_WIDTH,
  APP_SIDEBAR_WIDTH_KEY,
  CHAT_TERMINAL_HEIGHT,
  CHAT_TERMINAL_HEIGHT_KEY,
  loadPanelSize,
  loadPanelWidth,
  savePanelSize,
  savePanelWidth,
  UTILITY_DRAWER_WIDTH,
  UTILITY_DRAWER_WIDTH_KEY,
} from "./panel-layout";
import type {
  ProjectDraft,
  ProjectLike,
  ProjectResourceLike,
  ProjectScope,
} from "./project-manager/models";
import { projectNavigationTarget } from "./project-navigation";
import {
  isChatTerminalShortcut,
  isCommandPaletteShortcut,
  shouldIgnoreShellShortcut,
} from "./shell-shortcuts";
import { workspacePathsEqual } from "./workspace-path";
import { resolveWorkspaceSelection } from "./workspace-selection";

function pathsEqual(left: string | undefined, right: string): boolean {
  return workspacePathsEqual(left, right, window.doolittle.platform);
}

type ApprovalListResponse = { approvals?: unknown[] };
type DelegationTasksResponse = { tasks?: unknown[] };

const ChatTerminalPanel = lazy(() =>
  import("./app-shell/ChatTerminalPanel").then((module) => ({
    default: module.ChatTerminalPanel,
  })),
);

export function App() {
  const initialConversation = useMemo(newConversationId, []);
  const [view, setViewState] = useState<View>(viewFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [chatTerminalOpen, setChatTerminalOpen] = useState(false);
  const [chatTerminalMounted, setChatTerminalMounted] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) === "true",
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadPanelWidth(localStorage, APP_SIDEBAR_WIDTH_KEY, APP_SIDEBAR_WIDTH),
  );
  const [utilityDrawerWidth, setUtilityDrawerWidth] = useState(() =>
    loadPanelWidth(
      localStorage,
      UTILITY_DRAWER_WIDTH_KEY,
      UTILITY_DRAWER_WIDTH,
    ),
  );
  const [chatTerminalHeight, setChatTerminalHeight] = useState(() =>
    loadPanelSize(localStorage, CHAT_TERMINAL_HEIGHT_KEY, CHAT_TERMINAL_HEIGHT),
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
  const [pendingChatContext, setPendingChatContext] =
    useState<ChatContextHandoff | null>(null);
  const [pendingNavigationIntent, setPendingNavigationIntent] =
    useState<DesktopNavigationIntent | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [appearance, setAppearance] = useState<DesktopAppearance>(
    loadAppearancePreference,
  );
  const [density, setDensity] = useState<DesktopDensity>(loadDensityPreference);
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedAppearance = resolveAppearance(appearance, systemPrefersDark);
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
    backend.phase === "ready" && utilityOpen ? "/activity?limit=50" : null,
    [backend.phase, utilityOpen],
  );
  const appMainRef = useRef<HTMLElement | null>(null);
  const [chatChromeHost, setChatChromeHost] = useState<HTMLElement | null>(
    null,
  );
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
  const utilityRef = useRef<HTMLElement | null>(null);
  const utilityReturnFocusRef = useRef<HTMLElement | null>(null);
  const chatTerminalReturnFocusRef = useRef<HTMLElement | null>(null);
  const projectTransitionRef = useRef(0);
  const pendingProjectScopeRef = useRef<ProjectScope | null>(null);
  const workspaceSwitchInFlightRef = useRef(0);
  const isMobileSidebarMode = useMediaQuery(MOBILE_SIDEBAR_QUERY);
  const mobileSidebarOpen = sidebarOpen && isMobileSidebarMode;

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

  const toggleUtilities = useCallback(() => {
    if (utilityOpen) closeUtilities();
    else openUtilities();
  }, [closeUtilities, openUtilities, utilityOpen]);

  const closeChatTerminal = useCallback(() => {
    setChatTerminalOpen(false);
    const restoreTarget = chatTerminalReturnFocusRef.current;
    chatTerminalReturnFocusRef.current = null;
    if (restoreTarget?.isConnected) {
      requestAnimationFrame(() => restoreTarget.focus());
    }
  }, []);

  const openChatTerminal = useCallback(() => {
    chatTerminalReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMobileSidebarOpen(false);
    setChatTerminalMounted(true);
    setChatTerminalOpen(true);
  }, [setMobileSidebarOpen]);

  const toggleChatTerminal = useCallback(() => {
    if (chatTerminalOpen) closeChatTerminal();
    else openChatTerminal();
  }, [chatTerminalOpen, closeChatTerminal, openChatTerminal]);

  useEffect(() => {
    if (chatTerminalOpen || !chatTerminalMounted) return;
    const timer = window.setTimeout(() => setChatTerminalMounted(false), 210);
    return () => window.clearTimeout(timer);
  }, [chatTerminalMounted, chatTerminalOpen]);

  const setView = useCallback(
    (next: View) => {
      preloadDesktopRoute(next);
      setViewState(next);
      setMobileSidebarOpen(false);
      if (next !== "chat") closeChatTerminal();
      if (isMobileSidebarMode) setUtilityOpen(false);
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
    [closeChatTerminal, isMobileSidebarMode, setMobileSidebarOpen],
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
      if (!isMobileSidebarMode || event.key !== "Tab") return;

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
    [closeUtilities, isMobileSidebarMode, utilityOpen],
  );

  const createConversation = useCallback(() => {
    if (isMobileSidebarMode) setMobileSidebarOpen(true);
    setNewConversationMenuOpen(true);
  }, [isMobileSidebarMode, setMobileSidebarOpen]);

  const toggleAppearance = useCallback(() => {
    const nextAppearance = resolvedAppearance === "dark" ? "light" : "dark";
    setAppearance(nextAppearance);
    pushToast({
      tone: "success",
      title: `${nextAppearance === "dark" ? "Dark" : "Light"} appearance`,
      message: "Your desktop preference was saved.",
    });
  }, [pushToast, resolvedAppearance]);

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

  const applyWorkspaceSelection = useCallback(
    (state: WorkspaceState, sessionId = selectedSession) => {
      const selection = resolveWorkspaceSelection({
        workspacePath: state.currentPath,
        projects,
        sessions,
        selectedSessionId: sessionId,
        createSessionId: newConversationId,
        pathsEqual,
      });
      setWorkspace(state);
      setProjectScope(selection.projectScope);
      setSelectedSession(selection.sessionId);
    },
    [projects, selectedSession, sessions],
  );

  const chooseWorkspace =
    useCallback(async (): Promise<WorkspacePickResult> => {
      const transition = projectTransitionRef.current + 1;
      projectTransitionRef.current = transition;
      pendingProjectScopeRef.current = null;
      workspaceSwitchInFlightRef.current += 1;
      try {
        const result = await window.doolittle.pickWorkspace();
        if (projectTransitionRef.current === transition && !result.canceled) {
          applyWorkspaceSelection(result.state);
        }
        return result;
      } finally {
        workspaceSwitchInFlightRef.current -= 1;
      }
    }, [applyWorkspaceSelection]);

  const openWorkspacePath = useCallback(
    async (path: string): Promise<WorkspacePickResult> => {
      const transition = projectTransitionRef.current + 1;
      projectTransitionRef.current = transition;
      pendingProjectScopeRef.current = null;
      workspaceSwitchInFlightRef.current += 1;
      try {
        const result = await window.doolittle.openWorkspace(path);
        if (projectTransitionRef.current === transition && !result.canceled) {
          applyWorkspaceSelection(result.state);
        }
        return result;
      } finally {
        workspaceSwitchInFlightRef.current -= 1;
      }
    },
    [applyWorkspaceSelection],
  );

  const switchToRecentWorkspace = useCallback(
    async (
      path: string,
      options: {
        announce?: boolean;
        sessionId?: string;
        transition?: number;
      } = {},
    ) => {
      const announce = options.announce ?? true;
      const transition = options.transition ?? projectTransitionRef.current + 1;
      if (options.transition === undefined) {
        projectTransitionRef.current = transition;
        pendingProjectScopeRef.current = null;
      }
      workspaceSwitchInFlightRef.current += 1;
      try {
        const result = await window.doolittle.switchWorkspace(path);
        if (projectTransitionRef.current !== transition) return false;
        // Commit the runtime workspace and its project/chat identity as one
        // parent-owned transition. A recent folder cannot leave the Code/Git
        // surface on one repository while Chat is scoped to another.
        applyWorkspaceSelection(
          result.state,
          options.sessionId ?? selectedSession,
        );
        if (options.transition === undefined) {
          pendingProjectScopeRef.current = null;
        }
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
      } finally {
        workspaceSwitchInFlightRef.current -= 1;
      }
    },
    [applyWorkspaceSelection, pushToast, selectedSession],
  );

  const reloadProjects = useCallback(async () => {
    const response = await desktopRequest<ProjectsResponse>(
      "/projects?includeArchived=true",
    );
    setProjects(response.projects);
    return response.projects;
  }, []);

  const activateProjectWorkspace = useCallback(
    async (
      scope: ProjectScope,
      transition?: number,
      sessionId?: string,
    ): Promise<boolean> => {
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
          return switchToRecentWorkspace(project.primaryPath, {
            announce: false,
            sessionId,
            transition,
          });
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
    (
      scope: ProjectScope,
      sessionId: string,
      nextView?: View,
      onActivated?: () => void,
    ) => {
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
        void activateProjectWorkspace(scope, transition, sessionId).then(
          (activated) => {
            if (projectTransitionRef.current !== transition) return;
            pendingProjectScopeRef.current = null;
            if (!activated) return;
            setProjectScope(scope);
            setSelectedSession(sessionId);
            if (nextView) setView(nextView);
            onActivated?.();
          },
        );
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
        projectNavigationTarget("select-scope"),
      );
    },
    [sessions, transitionToProjectScope],
  );

  const startConversation = useCallback(
    (scope: ProjectScope) => {
      setNewConversationMenuOpen(false);
      transitionToProjectScope(
        scope,
        newConversationId(),
        projectNavigationTarget("new-conversation"),
      );
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

  const chooseRepositoryForConversation = useCallback(
    async (targetSessionId?: string) => {
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
        transitionToProjectScope(
          selectedProject.id,
          targetSessionId ?? newConversationId(),
          projectNavigationTarget("new-conversation"),
        );
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
    },
    [projects, pushToast, transitionToProjectScope],
  );

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
    applyDesktopAppearance(appearance, systemPrefersDark);
  }, [appearance, systemPrefersDark]);

  useEffect(() => {
    applyDesktopDensity(density);
  }, [density]);

  useEffect(() => {
    const stored = loadStoredDesktopTheme();
    if (stored) applyDesktopTheme(stored);
  }, []);

  useEffect(() => {
    if (backend.phase !== "ready") return;
    let disposed = false;
    void desktopRequest<ThemeResponse>("/theme")
      .then((response) => {
        if (disposed) return;
        const profile = parseDesktopThemeProfile(response.profile);
        if (profile) applyDesktopTheme(profile);
      })
      .catch(() => {
        // The cached profile preserves the visual theme while the runtime recovers.
      });
    return () => {
      disposed = true;
    };
  }, [backend.phase]);

  useEffect(() => {
    return subscribeToDesktopThemeChanges({
      onAppearance: setAppearance,
      onDensity: setDensity,
      onTheme: applyDesktopTheme,
    });
  }, []);

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
    void switchToRecentWorkspace(projectPath, { announce: false });
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
    savePanelWidth(
      localStorage,
      APP_SIDEBAR_WIDTH_KEY,
      sidebarWidth,
      APP_SIDEBAR_WIDTH,
    );
  }, [sidebarWidth]);

  useEffect(() => {
    savePanelWidth(
      localStorage,
      UTILITY_DRAWER_WIDTH_KEY,
      utilityDrawerWidth,
      UTILITY_DRAWER_WIDTH,
    );
  }, [utilityDrawerWidth]);

  useEffect(() => {
    savePanelSize(
      localStorage,
      CHAT_TERMINAL_HEIGHT_KEY,
      chatTerminalHeight,
      CHAT_TERMINAL_HEIGHT,
    );
  }, [chatTerminalHeight]);

  useEffect(() => {
    localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify([...openSections]));
  }, [openSections]);

  useEffect(() => {
    if (!utilityOpen || !isMobileSidebarMode) return;
    requestAnimationFrame(() => {
      const [first] = collectSidebarFocusables(utilityRef.current);
      (first || utilityRef.current)?.focus();
    });
  }, [isMobileSidebarMode, utilityOpen]);

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
    const onHashChange = () => {
      const nextView = viewFromHash();
      preloadDesktopRoute(nextView);
      setViewState(nextView);
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "/chat";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onChatTerminalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (view !== "chat" || !isChatTerminalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleChatTerminal();
    };
    window.addEventListener("keydown", onChatTerminalKeyDown, true);
    return () =>
      window.removeEventListener("keydown", onChatTerminalKeyDown, true);
  }, [toggleChatTerminal, view]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        return;
      }
      if (shouldIgnoreShellShortcut(event)) return;
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setView("settings");
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
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
          case "toggle-terminal":
            if (view === "chat") toggleChatTerminal();
            break;
          case "toggle-inspector":
            toggleInspector();
            break;
        }
      }),
    [
      createConversation,
      setView,
      toggleChatTerminal,
      toggleInspector,
      toggleNavigation,
      view,
    ],
  );

  useEffect(() => {
    void window.doolittle.getBackendState().then(setBackend);
    return window.doolittle.onBackendState(setBackend);
  }, []);

  useEffect(() => {
    void window.doolittle.getWorkspaceState().then(setWorkspace);
    return window.doolittle.onWorkspaceState((state) => {
      if (workspaceSwitchInFlightRef.current > 0) {
        setWorkspace(state);
        return;
      }
      applyWorkspaceSelection(state);
    });
  }, [applyWorkspaceSelection]);

  useEffect(() => {
    if (backend.phase === "ready") {
      void refreshRuntime();
    } else {
      setRuntime(null);
    }
  }, [backend.phase, refreshRuntime]);

  useIntervalWhenDocumentVisible(
    () => {
      if (utilityOpen) activityResource.reload();
      approvalsResource.reload();
      tasksResource.reload();
    },
    15_000,
    backend.phase === "ready",
  );

  const openSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((entry) => entry.sessionId === sessionId);
      transitionToProjectScope(
        session ? (session.projectId ?? "unscoped") : projectScope,
        sessionId,
        projectNavigationTarget("open-conversation"),
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
      if (event.target === "terminal" || event.target === "workspace") {
        setView("code");
        return;
      }
      if (event.target === "codegen") {
        setView("orchestration");
        return;
      }
      if (event.target === "operations") {
        setView("logs");
        return;
      }
      setView(event.target);
    },
    [closeUtilities, openSession, setView],
  );

  const openChatWithContext = useCallback(
    (request: ChatContextRequest) => {
      const text = request.text.trim();
      if (!text) return;
      const scope = resolveChatContextProjectScope(
        { ...request, text },
        projects,
        pathsEqual,
      );
      if (!scope) {
        pushToast({
          tone: "warning",
          title: "Context was not sent",
          message:
            "Select or create a project for this workspace before sending its context to Chat.",
        });
        return;
      }
      const belongsToScope = (session: SessionSummary) =>
        scope === "unscoped" ? !session.projectId : session.projectId === scope;
      const targetSession =
        sessions.find(
          (session) =>
            session.sessionId === selectedSession && belongsToScope(session),
        ) ??
        sessions
          .filter(belongsToScope)
          .sort((left, right) =>
            (right.endedAt ?? right.startedAt ?? "").localeCompare(
              left.endedAt ?? left.startedAt ?? "",
            ),
          )[0];
      const sessionId = targetSession?.sessionId ?? newConversationId();
      const handoff: ChatContextHandoff = {
        id: crypto.randomUUID(),
        text,
        workspacePath: request.workspacePath,
        projectScope: scope,
        sessionId,
      };
      transitionToProjectScope(scope, sessionId, "chat", () => {
        setPendingChatContext(handoff);
      });
    },
    [projects, pushToast, selectedSession, sessions, transitionToProjectScope],
  );

  const consumeChatContext = useCallback((id: string) => {
    setPendingChatContext((current) => (current?.id === id ? null : current));
  }, []);

  const consumeNavigationIntent = useCallback((id: string) => {
    setPendingNavigationIntent((current) =>
      acknowledgeNavigationIntent(current, id),
    );
  }, []);

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
          setPendingNavigationIntent(
            createWorkspaceFileNavigationIntent(target.path),
          );
          break;
        case "task":
          if (
            target.workspacePath &&
            !pathsEqual(target.workspacePath, workspace.currentPath)
          ) {
            void switchToRecentWorkspace(target.workspacePath, {
              announce: false,
            }).then((switched) => {
              if (!switched) return;
              setView("orchestration");
              setPendingNavigationIntent(
                createOrchestrationTaskNavigationIntent(target.taskId),
              );
            });
          } else {
            setView("orchestration");
            setPendingNavigationIntent(
              createOrchestrationTaskNavigationIntent(target.taskId),
            );
          }
          break;
        case "log":
          setView("logs");
          break;
      }
    },
    [
      openSession,
      selectProjectScope,
      setView,
      switchToRecentWorkspace,
      workspace.currentPath,
    ],
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

  const navigationView = view === "review" ? "orchestration" : view;
  const activeSection = navigation.find((section) =>
    section.items.some((item) => item.id === navigationView),
  );
  const activeItem = activeSection?.items.find(
    (item) => item.id === navigationView,
  );
  const pendingApprovals = asArray(approvalsResource.data?.approvals).length;
  const runningTasks = asArray(tasksResource.data?.tasks).length;
  const activeProject =
    projectScope === "all" || projectScope === "unscoped"
      ? null
      : (projects.find((project) => project.id === projectScope) ?? null);
  const projectScopeLabel =
    activeProject?.name ??
    (projectScope === "unscoped" ? "General" : "All projects");
  useEffect(() => {
    document.title = `${activeItem?.label ?? "Desktop"} — Doolittle`;
  }, [activeItem?.label]);
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

  const commandGroups = useMemo(
    () =>
      buildDesktopCommandGroups({
        backendPhase: backend.phase,
        navCollapsed,
        onChooseRepository: () => chooseRepositoryForConversation(),
        onCreateConversation: createConversation,
        onOpenProjectManager: openProjectManager,
        onOpenSession: openSession,
        onRefresh: refreshWithFeedback,
        onSelectProjectScope: selectProjectScope,
        onSetView: setView,
        onSwitchRecentWorkspace: switchToRecentWorkspace,
        onToggleAppearance: toggleAppearance,
        onToggleTerminal: () => {
          if (view !== "chat") {
            setView("chat");
            openChatTerminal();
            return;
          }
          toggleChatTerminal();
        },
        onToggleNavigation: toggleNavigation,
        paletteQuery,
        platform: window.doolittle.platform,
        projectCards,
        recentWorkspacePaths: workspace.recentPaths,
        resolvedAppearance,
        runningTasks,
        searchCommandGroups,
        sessionsCount: sessions.length,
        sidebarSessions,
        terminalOpen: view === "chat" && chatTerminalOpen,
        workspacePath: workspace.currentPath,
      }),
    [
      backend.phase,
      chooseRepositoryForConversation,
      createConversation,
      navCollapsed,
      openProjectManager,
      openChatTerminal,
      openSession,
      paletteQuery,
      projectCards,
      refreshWithFeedback,
      resolvedAppearance,
      runningTasks,
      searchCommandGroups,
      selectProjectScope,
      sessions.length,
      setView,
      sidebarSessions,
      switchToRecentWorkspace,
      toggleAppearance,
      toggleChatTerminal,
      toggleNavigation,
      chatTerminalOpen,
      view,
      workspace.currentPath,
      workspace.recentPaths,
    ],
  );

  const content = (
    <DesktopRouteContent
      activeProject={activeProject}
      approvalsResource={approvalsResource}
      tasksResource={tasksResource}
      backend={backend}
      chatChromeHost={chatChromeHost}
      navigation={{
        chooseRepositoryForConversation,
        consumeNavigationIntent,
        createConversation,
        openChatWithContext,
        openProjectManager,
        openSession,
        selectSession: setSelectedSession,
        setView,
        transitionToProjectScope,
      }}
      onChooseWorkspace={chooseWorkspace}
      onConsumeContextHandoff={consumeChatContext}
      onOpenWorkspacePath={openWorkspacePath}
      pendingApprovals={pendingApprovals}
      pendingContextHandoff={pendingChatContext}
      pendingNavigationIntent={pendingNavigationIntent}
      projectCards={projectCards}
      projectLabels={projectLabels}
      projectScope={projectScope}
      refreshRuntime={refreshRuntime}
      runtime={runtime}
      runningTasks={runningTasks}
      scopedSessions={scopedSessions}
      selectedSession={selectedSession}
      view={view}
      workspacePath={workspace.currentPath}
    />
  );

  return (
    <main
      className={`desktop-shell ${navCollapsed ? "nav-collapsed" : ""}${
        utilityOpen ? " utility-open" : ""
      }`}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--utility-drawer-width": `${utilityDrawerWidth}px`,
        } as CSSProperties
      }
    >
      <CommandPalette
        groups={commandGroups}
        isOpen={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteQuery("");
        }}
        onQueryChange={setPaletteQuery}
        resetOnOpen
        searchPlaceholder="Search commands, projects, chats, and files…"
        title="Command menu"
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
      <ToastRegion
        onDismiss={dismissToast}
        onPause={pauseToast}
        onResume={resumeToast}
        toasts={toasts}
      />
      <DesktopSidebar
        isMobileSidebarMode={isMobileSidebarMode}
        mobileSidebarOpen={mobileSidebarOpen}
        navCollapsed={navCollapsed}
        sidebarOpen={sidebarOpen}
        projectScope={projectScope}
        newConversationMenuOpen={newConversationMenuOpen}
        sidebarWidth={sidebarWidth}
        projectCards={projectCards}
        sessions={sessions}
        selectedSession={selectedSession}
        view={view}
        navigationView={navigationView}
        workspacePath={workspace.currentPath}
        resolvedAppearance={resolvedAppearance}
        platform={window.doolittle.platform}
        sidebarRef={sidebarRef}
        onSidebarKeyDown={handleSidebarKeyDown}
        onClose={() => setMobileSidebarOpen(false)}
        onResize={setSidebarWidth}
        onToggleNavigation={toggleNavigation}
        onSetNewConversationMenuOpen={setNewConversationMenuOpen}
        onOpenPalette={() => setPaletteOpen(true)}
        onChooseRepository={chooseRepositoryForConversation}
        onManageProjects={openProjectManager}
        onStartConversation={startConversation}
        onOpenSession={openSession}
        onPreloadView={preloadDesktopRoute}
        onSelectScope={selectProjectScope}
        onViewAll={() => setView("sessions")}
        onSetView={setView}
        onToggleUtilities={toggleUtilities}
        utilityOpen={utilityOpen}
        onToggleAppearance={toggleAppearance}
      />
      <section
        className={`app-main${view === "chat" ? " app-main--chat" : ""}`}
        ref={appMainRef}
      >
        <div
          className={`window-dragbar${
            view === "chat" ? " window-dragbar--chat" : ""
          }`}
        >
          <div className="window-dragbar-primary">
            <DesktopMobileMenuButton onOpen={openSidebarForMobile} />
            <div className="window-context">
              <DesktopWindowContext
                itemLabel={activeItem?.label ?? "Desktop"}
                onOpenProjectManager={openProjectManager}
                projectScopeLabel={projectScopeLabel}
                sectionLabel={activeSection?.label ?? "Doolittle"}
              />
            </div>
            <span aria-live="polite" className="sr-only">
              {`${activeItem?.label ?? "Desktop"} opened for ${projectScopeLabel}`}
            </span>
            {view === "chat" ? (
              <div
                aria-label="Conversation controls"
                className="chat-chrome-host"
                ref={setChatChromeHost}
                role="toolbar"
              />
            ) : null}
            <div className="window-tools">
              <DesktopWindowTools
                backend={backend}
                onOpenPalette={() => setPaletteOpen(true)}
                onRefresh={() => void refreshWithFeedback()}
                onToggleUtilities={toggleUtilities}
                platform={window.doolittle.platform}
                utilityOpen={utilityOpen}
              />
            </div>
          </div>
        </div>
        <DesktopRuntimeNotices
          backend={backend}
          globalError={globalError}
          onRefresh={() => void refreshWithFeedback()}
          onRestart={() => void restartRuntime()}
        />
        <div
          className={`view-container view-${view}`}
          data-view={view}
          key={view}
        >
          <Suspense fallback={<DesktopRouteLoadingFallback />}>
            {content}
          </Suspense>
        </div>
        {view === "chat" && chatTerminalMounted ? (
          <Suspense fallback={null}>
            <ChatTerminalPanel
              active={backend.phase === "ready"}
              height={chatTerminalHeight}
              open={chatTerminalOpen}
              onClose={closeChatTerminal}
              onResize={setChatTerminalHeight}
              onSendToChat={(text) =>
                openChatWithContext({
                  text,
                  workspacePath: workspace.currentPath,
                  projectScope,
                })
              }
              platform={window.doolittle.platform}
              workspacePath={workspace.currentPath}
            />
          </Suspense>
        ) : null}
      </section>
      {utilityOpen ? (
        <DesktopUtilityLayer
          activeView={view}
          activity={
            <ActivityCenter
              active={backend.phase === "ready"}
              error={activityResource.error}
              events={activityResource.data?.events ?? []}
              loading={activityResource.loading}
              onOpenTarget={openActivityTarget}
              reload={activityResource.reload}
            />
          }
          onClose={closeUtilities}
          onKeyDown={handleUtilityKeyDown}
          onPreload={preloadDesktopRoute}
          onResize={setUtilityDrawerWidth}
          onSelect={setView}
          onToggleSection={toggleSection}
          openSections={openSections}
          utilityDrawerWidth={utilityDrawerWidth}
          utilityRef={utilityRef}
        />
      ) : null}
    </main>
  );
}
