import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import {
  type CSSProperties,
  type KeyboardEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActivityFeedResponse,
  ThemeResponse,
  WorkspaceState,
} from "../shared/contracts";
import {
  COMMAND_PALETTE_LOADING_BACKDROP_CLASS,
  COMMAND_PALETTE_LOADING_CLASS,
  COMMAND_PALETTE_LOADING_CLOSE_CLASS,
  COMMAND_PALETTE_LOADING_DISMISS_CLASS,
  COMMAND_PALETTE_LOADING_HEADER_CLASS,
  COMMAND_PALETTE_LOADING_MARK_CLASS,
  COMMAND_PALETTE_LOADING_STATUS_CLASS,
} from "./app-shell/command-palette-loading-layout";
import { DesktopMobileMenuButton } from "./app-shell/DesktopMobileMenuButton";
import { DesktopRouteLoadingFallback } from "./app-shell/DesktopRouteLoadingFallback";
import { DesktopSidebar } from "./app-shell/DesktopSidebar";
import { DesktopWindowContext } from "./app-shell/DesktopWindowContext";
import {
  preloadDesktopRoute,
  resetDesktopRoute,
  warmDesktopRoute,
} from "./app-shell/desktop-route-registry";
import {
  APP_MAIN_CLASS,
  CHAT_CHROME_HOST_CLASS,
  DESKTOP_SHELL_CLASS,
  VIEW_CONTAINER_CLASS,
  VIEW_CONTAINER_WORKSPACE_CLASS,
  WINDOW_CONTEXT_CLASS,
  WINDOW_DRAGBAR_CHAT_CLASS,
  WINDOW_DRAGBAR_CLASS,
  WINDOW_DRAGBAR_PRIMARY_CLASS,
  WINDOW_TOOLS_CLASS,
} from "./app-shell/shell-layout";
import { DesktopRouteErrorBoundary } from "./components/DesktopRouteErrorBoundary";
import { useToasts } from "./components/ToastRegion";
import { useModalFocusBoundary } from "./components/useModalFocusBoundary";
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
  type View,
  viewFromHash,
} from "./desktop-navigation";
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
import { confirmDirtyNavigation } from "./dirty-navigation";
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
import type { ProjectLike, ProjectScope } from "./project-manager/models";
import { projectNavigationTarget } from "./project-navigation";
import {
  isChatTerminalShortcut,
  isCommandPaletteShortcut,
  shouldIgnoreShellShortcut,
} from "./shell-shortcuts";
import { useDesktopContentNavigation } from "./use-desktop-content-navigation";
import { useProjectManagement } from "./use-project-management";
import { useRuntimeWorkspaceData } from "./use-runtime-workspace-data";
import { useWorkspaceProjectNavigation } from "./use-workspace-project-navigation";
import { guardDirtyCodeWorkspaceClose } from "./window-close-guard";
import { workspacePathsEqual } from "./workspace-path";

function pathsEqual(left: string | undefined, right: string): boolean {
  return workspacePathsEqual(left, right, window.doolittle.platform);
}

function createNavigationId(): string {
  return crypto.randomUUID();
}

type ApprovalListResponse = { approvals?: unknown[] };
type DelegationTasksResponse = { tasks?: unknown[] };

const ChatTerminalPanel = lazy(() =>
  import("./app-shell/ChatTerminalPanel").then((module) => ({
    default: module.ChatTerminalPanel,
  })),
);

const ActivityCenter = lazy(() =>
  import("./components/ActivityCenter").then((module) => ({
    default: module.ActivityCenter,
  })),
);

const DesktopUtilityLayer = lazy(() =>
  import("./app-shell/DesktopUtilityLayer").then((module) => ({
    default: module.DesktopUtilityLayer,
  })),
);

const DesktopRouteContent = lazy(() =>
  import("./app-shell/DesktopRouteContent").then((module) => ({
    default: module.DesktopRouteContent,
  })),
);

const DesktopRuntimeNotices = lazy(() =>
  import("./app-shell/DesktopRuntimeNotices").then((module) => ({
    default: module.DesktopRuntimeNotices,
  })),
);

const DesktopWindowTools = lazy(() =>
  import("./app-shell/DesktopWindowTools").then((module) => ({
    default: module.DesktopWindowTools,
  })),
);

const ToastViewport = lazy(() =>
  import("./components/ToastViewport").then((module) => ({
    default: module.ToastViewport,
  })),
);

const ProjectManager = lazy(() =>
  import("./components/ProjectManager").then((module) => ({
    default: module.ProjectManager,
  })),
);

type CommandPaletteModule = typeof import("./components/CommandPalette");

let commandPaletteModule: Promise<CommandPaletteModule> | null = null;

export function preloadCommandPalette(): Promise<CommandPaletteModule> {
  commandPaletteModule ??= import("./components/CommandPalette");
  return commandPaletteModule;
}

const LazyCommandPalette = lazy(async () => ({
  default: (await preloadCommandPalette()).DesktopCommandPalette,
}));

interface CommandPaletteLoadingFallbackProps {
  open: boolean;
  onClose: () => void;
  returnFocusTarget: HTMLElement | null;
}

export function CommandPaletteLoadingFallback({
  open,
  onClose,
  returnFocusTarget,
}: CommandPaletteLoadingFallbackProps) {
  const titleId = useId();
  const descriptionId = useId();
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useModalFocusBoundary({
    active: open,
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose,
    restoreFocus: true,
    restoreFocusTarget: returnFocusTarget,
  });

  if (!open) return null;

  return (
    <div
      className={COMMAND_PALETTE_LOADING_BACKDROP_CLASS}
      ref={backdropRef}
      role="presentation"
    >
      <button
        aria-label="Close command palette"
        className={COMMAND_PALETTE_LOADING_DISMISS_CLASS}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={COMMAND_PALETTE_LOADING_CLASS}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={COMMAND_PALETTE_LOADING_HEADER_CLASS}>
          <span
            aria-hidden="true"
            className={COMMAND_PALETTE_LOADING_MARK_CLASS}
          >
            &gt;
          </span>
          <h2 id={titleId}>Command menu</h2>
          <button
            aria-label="Close command palette"
            className={COMMAND_PALETTE_LOADING_CLOSE_CLASS}
            onClick={onClose}
            type="button"
          >
            Esc
          </button>
        </header>
        <div
          aria-busy="true"
          aria-live="polite"
          className={COMMAND_PALETTE_LOADING_STATUS_CLASS}
          id={descriptionId}
          role="status"
        >
          <i aria-hidden="true" />
          <span>Loading commands…</span>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const initialConversation = useMemo(newConversationId, []);
  const [view, setViewState] = useState<View>(viewFromHash);
  const [routeRetryNonce, setRouteRetryNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
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
  const [projectScope, setProjectScope] =
    useState<ProjectScope>(loadProjectScope);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [newConversationMenuOpen, setNewConversationMenuOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    currentPath: "",
    recentPaths: [],
  });
  const [codeWorkspaceDirty, setCodeWorkspaceDirty] = useState(false);
  const [codeEditingLocked, setCodeEditingLocked] = useState(false);
  const restoreCodeDirtyAfterFailedWorkspaceTransition = useCallback(
    () => setCodeWorkspaceDirty(codeWorkspaceDirty),
    [codeWorkspaceDirty],
  );
  const [selectedSession, setSelectedSession] = useState(initialConversation);
  const [appearance, setAppearance] = useState<DesktopAppearance>(
    loadAppearancePreference,
  );
  const [density, setDensity] = useState<DesktopDensity>(loadDensityPreference);
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedAppearance = resolveAppearance(appearance, systemPrefersDark);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      guardDirtyCodeWorkspaceClose(event, codeWorkspaceDirty);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [codeWorkspaceDirty]);
  const {
    toasts,
    push: pushToast,
    dismiss: dismissToast,
    pause: pauseToast,
    resume: resumeToast,
  } = useToasts({ maxVisible: 3, defaultTimeoutMs: 4_500 });
  const {
    backend,
    globalError,
    projects,
    refreshRuntime,
    refreshWithFeedback,
    restartRuntime,
    runtime,
    sessions,
    setProjects,
    setSessions,
  } = useRuntimeWorkspaceData(pushToast);
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
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
  const chatTerminalReturnFocusRef = useRef<HTMLElement | null>(null);
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

  const openCommandPalette = useCallback(() => {
    paletteReturnFocusRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    void preloadCommandPalette();
    setPaletteMounted(true);
    setPaletteOpen(true);
  }, []);

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

  const closeChatTerminal = useCallback((restoreFocus = true) => {
    setChatTerminalOpen(false);
    const restoreTarget = chatTerminalReturnFocusRef.current;
    chatTerminalReturnFocusRef.current = null;
    if (restoreFocus && restoreTarget?.isConnected) {
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

  const confirmViewChange = useCallback(
    (next: View) => {
      if (
        view === "code" &&
        next !== "code" &&
        !confirmDirtyNavigation({
          dirty: codeWorkspaceDirty,
          confirm: () =>
            window.confirm(
              "This coding workspace has unsaved edits. Leave and discard them?",
            ),
          discard: () => setCodeWorkspaceDirty(false),
        })
      ) {
        return false;
      }
      return true;
    },
    [codeWorkspaceDirty, view],
  );

  const applyViewTransition = useCallback(
    (
      next: View,
      { skipDirtyCheck = false }: { skipDirtyCheck?: boolean } = {},
    ) => {
      if (!skipDirtyCheck && !confirmViewChange(next)) return false;
      void warmDesktopRoute(next, backend.phase, workspace.currentPath).catch(
        () => undefined,
      );
      setViewState(next);
      setMobileSidebarOpen(false);
      if (isMobileSidebarMode) closeUtilities();
      const section = navigation.find((entry) =>
        entry.items.some((item) => item.id === next),
      );
      if (section) {
        setOpenSections((current) => {
          if (current.has(section.id)) return current;
          return new Set([...current, section.id]);
        });
      }
      return true;
    },
    [
      backend.phase,
      closeUtilities,
      confirmViewChange,
      isMobileSidebarMode,
      workspace.currentPath,
      setMobileSidebarOpen,
    ],
  );

  const setView = useCallback(
    (next: View, options?: { readonly skipDirtyCheck?: boolean }) => {
      if (options?.skipDirtyCheck) {
        if (!applyViewTransition(next, options)) return false;
      } else if (!applyViewTransition(next)) return false;
      window.location.hash = `/${next}`;
      return true;
    },
    [applyViewTransition],
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

  const {
    chooseWorkspace,
    handleWorkspaceState,
    openWorkspacePath,
    switchToRecentWorkspace,
    transitionToProjectScope,
  } = useWorkspaceProjectNavigation({
    backendReady: backend.phase === "ready",
    confirmViewChange,
    createSessionId: newConversationId,
    setCodeEditingLocked,
    restoreCodeDirtyAfterFailedWorkspaceTransition,
    pathsEqual,
    projects,
    projectScope,
    pushToast,
    selectedSession,
    sessions,
    setProjectScope,
    setSelectedSession,
    setView,
    setWorkspace,
    workspace,
    confirmWorkspaceChange: () =>
      confirmDirtyNavigation({
        dirty: codeWorkspaceDirty,
        confirm: () =>
          window.confirm(
            "This coding workspace has unsaved edits. Change workspace and discard them?",
          ),
        discard: () => setCodeWorkspaceDirty(false),
      }),
  });

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

  const {
    addProjectResources,
    archiveProject,
    chooseRepositoryForConversation,
    createProject,
    moveCurrentChat,
    pinProject,
    removeProjectResource,
    setProjectPrimaryPath,
    updateProject,
  } = useProjectManagement({
    createSessionId: newConversationId,
    pathsEqual,
    projectScope,
    projects,
    pushToast,
    selectProjectScope,
    selectedSession,
    setProjectScope,
    setProjects,
    setSelectedSession,
    setSessions,
    setView,
    setWorkspace,
    switchToRecentWorkspace,
    transitionToProjectScope,
    workspace,
  });

  const {
    consumeChatContext,
    consumeNavigationIntent,
    openActivityTarget,
    openChatWithContext,
    openSession,
    openWorkspaceFile,
    pendingChatContext,
    pendingNavigationIntent,
    searchCommandGroups,
  } = useDesktopContentNavigation({
    backendReady: backend.phase === "ready",
    closeUtilities,
    createId: createNavigationId,
    createSessionId: newConversationId,
    paletteOpen,
    paletteQuery,
    pathsEqual,
    projects,
    projectScope,
    pushToast,
    selectedSession,
    selectProjectScope,
    sessions,
    setProjectManagerOpen,
    setView,
    switchToRecentWorkspace,
    transitionToProjectScope,
    workspacePath: workspace.currentPath,
  });

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
    if (!sidebar || !appMain || !isMobileSidebarMode || !utilityOpen) {
      return;
    }
    sidebar.setAttribute("inert", "");
    appMain.setAttribute("inert", "");
    appMain.setAttribute("aria-hidden", "true");
    return () => {
      if (mobileSidebarOpen) return;
      sidebar.removeAttribute("inert");
      appMain.removeAttribute("inert");
      appMain.removeAttribute("aria-hidden");
    };
  }, [isMobileSidebarMode, mobileSidebarOpen, utilityOpen]);

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
      const next = viewFromHash();
      if (!applyViewTransition(next) && window.location.hash !== `#/${view}`) {
        window.location.hash = `/${view}`;
      }
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "/chat";
    else onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [applyViewTransition, view]);

  useEffect(() => {
    const onChatTerminalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isChatTerminalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleChatTerminal();
    };
    window.addEventListener("keydown", onChatTerminalKeyDown, true);
    return () =>
      window.removeEventListener("keydown", onChatTerminalKeyDown, true);
  }, [toggleChatTerminal]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        if (paletteOpen) {
          setPaletteOpen(false);
          setPaletteQuery("");
          const returnTarget = paletteReturnFocusRef.current;
          if (returnTarget?.isConnected) {
            requestAnimationFrame(() => returnTarget.focus());
          }
        } else {
          openCommandPalette();
        }
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
  }, [
    createConversation,
    openCommandPalette,
    paletteOpen,
    setView,
    toggleInspector,
    toggleNavigation,
  ]);

  useEffect(
    () =>
      window.doolittle.onAppCommand((command) => {
        switch (command) {
          case "new-chat":
            createConversation();
            break;
          case "command-palette":
            openCommandPalette();
            break;
          case "settings":
            setView("settings");
            break;
          case "toggle-sidebar":
            toggleNavigation();
            break;
          case "toggle-terminal":
            toggleChatTerminal();
            break;
          case "toggle-inspector":
            toggleInspector();
            break;
        }
      }),
    [
      createConversation,
      openCommandPalette,
      setView,
      toggleChatTerminal,
      toggleInspector,
      toggleNavigation,
    ],
  );

  useEffect(() => {
    void window.doolittle.getWorkspaceState().then(setWorkspace);
    return window.doolittle.onWorkspaceState(handleWorkspaceState);
  }, [handleWorkspaceState]);

  useIntervalWhenDocumentVisible(
    () => {
      if (utilityOpen) activityResource.reload();
      approvalsResource.reload();
      tasksResource.reload();
    },
    15_000,
    backend.phase === "ready",
  );

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
  const routeWarmReadyRef = useRef(false);
  useEffect(() => {
    const runtimeReady = backend.phase === "ready";
    if (!runtimeReady) {
      routeWarmReadyRef.current = false;
      return;
    }
    if (routeWarmReadyRef.current) return;
    routeWarmReadyRef.current = true;
    void warmDesktopRoute(view, backend.phase, workspace.currentPath).catch(
      () => undefined,
    );
  }, [backend.phase, view, workspace.currentPath]);
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

  const content = (
    <DesktopRouteContent
      activeProject={activeProject}
      approvalsResource={approvalsResource}
      tasksResource={tasksResource}
      backend={backend}
      chatChromeHost={chatChromeHost}
      codeEditingLocked={codeEditingLocked}
      navigation={{
        chooseRepositoryForConversation,
        consumeNavigationIntent,
        createConversation,
        openChatWithContext,
        openChatTerminal,
        openProjectManager,
        openSession,
        openWorkspaceFile,
        selectSession: setSelectedSession,
        setView,
        transitionToProjectScope,
      }}
      onChooseWorkspace={chooseWorkspace}
      onConsumeContextHandoff={consumeChatContext}
      onOpenWorkspacePath={openWorkspacePath}
      onCodeWorkspaceDirtyChange={setCodeWorkspaceDirty}
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
      className={`${DESKTOP_SHELL_CLASS}${navCollapsed ? " nav-collapsed" : ""}`}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--utility-drawer-width": `${utilityDrawerWidth}px`,
          gridTemplateColumns: isMobileSidebarMode
            ? "minmax(0, 1fr)"
            : `${navCollapsed ? "var(--sidebar-compact-width)" : "var(--sidebar-width)"} minmax(0, 1fr) ${
                utilityOpen
                  ? "minmax(292px, min(var(--utility-drawer-width), 44vw))"
                  : "0"
              }`,
        } as CSSProperties
      }
    >
      {paletteMounted ? (
        <Suspense
          fallback={
            <CommandPaletteLoadingFallback
              onClose={() => {
                setPaletteOpen(false);
                setPaletteQuery("");
              }}
              open={paletteOpen}
              returnFocusTarget={paletteReturnFocusRef.current}
            />
          }
        >
          <LazyCommandPalette
            backendPhase={backend.phase}
            isOpen={paletteOpen}
            navCollapsed={navCollapsed}
            onChooseRepository={chooseRepositoryForConversation}
            onClose={() => {
              setPaletteOpen(false);
              setPaletteQuery("");
            }}
            onCreateConversation={createConversation}
            onOpenProjectManager={openProjectManager}
            onOpenSession={openSession}
            onQueryChange={setPaletteQuery}
            onRefresh={refreshWithFeedback}
            onSelectProjectScope={selectProjectScope}
            onSetView={setView}
            onSwitchRecentWorkspace={switchToRecentWorkspace}
            onToggleAppearance={toggleAppearance}
            onToggleNavigation={toggleNavigation}
            onToggleTerminal={toggleChatTerminal}
            paletteQuery={paletteQuery}
            platform={window.doolittle.platform}
            projectCards={projectCards}
            recentWorkspacePaths={workspace.recentPaths}
            resetOnOpen
            resolvedAppearance={resolvedAppearance}
            returnFocusTarget={paletteReturnFocusRef.current}
            runningTasks={runningTasks}
            searchCommandGroups={searchCommandGroups}
            searchPlaceholder="Search commands, projects, chats, and files…"
            sessionsCount={sessions.length}
            sidebarSessions={sidebarSessions}
            terminalOpen={chatTerminalOpen}
            title="Command menu"
            workspacePath={workspace.currentPath}
          />
        </Suspense>
      ) : null}
      {projectManagerOpen ? (
        <Suspense fallback={null}>
          <ProjectManager
            activeScope={projectScope}
            allChatCount={sessions.length}
            currentChatId={selectedSession}
            currentChatProjectId={selectedSessionProjectId}
            isOpen
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
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <ToastViewport
          onDismiss={dismissToast}
          onPause={pauseToast}
          onResume={resumeToast}
          toasts={toasts}
        />
      </Suspense>
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
        onOpenPalette={openCommandPalette}
        onChooseRepository={chooseRepositoryForConversation}
        onManageProjects={openProjectManager}
        onStartConversation={startConversation}
        onOpenSession={openSession}
        onPreloadView={(next) =>
          preloadDesktopRoute(next, backend.phase, workspace.currentPath)
        }
        onSelectScope={selectProjectScope}
        onViewAll={() => setView("sessions")}
        onSetView={setView}
        onToggleUtilities={toggleUtilities}
        utilityOpen={utilityOpen}
        onToggleAppearance={toggleAppearance}
      />
      <section
        className={`${APP_MAIN_CLASS}${view === "chat" ? " app-main--chat" : ""}`}
        ref={appMainRef}
      >
        <div
          className={`${WINDOW_DRAGBAR_CLASS}${
            view === "chat" ? ` ${WINDOW_DRAGBAR_CHAT_CLASS}` : ""
          }`}
        >
          <div className={WINDOW_DRAGBAR_PRIMARY_CLASS}>
            <DesktopMobileMenuButton onOpen={openSidebarForMobile} />
            <div
              className={`${WINDOW_CONTEXT_CLASS}${
                navCollapsed ? " min-[941px]:hidden" : ""
              }`}
            >
              <DesktopWindowContext
                itemLabel={activeItem?.label ?? "Desktop"}
                onOpenProjectManager={openProjectManager}
                projectScopeLabel={projectScopeLabel}
                sectionLabel={activeSection?.label ?? "Doolittle"}
                showRouteContext={
                  view === "chat" ||
                  view === "code" ||
                  view === "review" ||
                  view === "orchestration"
                }
              />
            </div>
            <span aria-live="polite" className="sr-only">
              {`${activeItem?.label ?? "Desktop"} opened for ${projectScopeLabel}`}
            </span>
            {view === "chat" ? (
              <div
                aria-label="Conversation controls"
                className={CHAT_CHROME_HOST_CLASS}
                ref={setChatChromeHost}
                role="toolbar"
              />
            ) : null}
            <div className={WINDOW_TOOLS_CLASS}>
              <Suspense fallback={null}>
                <DesktopWindowTools
                  backend={backend}
                  compactCommand={view === "chat"}
                  onOpenPalette={openCommandPalette}
                  onRefresh={() => void refreshWithFeedback()}
                  onToggleUtilities={toggleUtilities}
                  platform={window.doolittle.platform}
                  utilityOpen={utilityOpen}
                />
              </Suspense>
            </div>
          </div>
        </div>
        <Suspense fallback={null}>
          <DesktopRuntimeNotices
            backend={backend}
            globalError={globalError}
            onRefresh={() => void refreshWithFeedback()}
            onRestart={() => void restartRuntime()}
          />
        </Suspense>
        <div
          className={`${VIEW_CONTAINER_CLASS} view-${view}${
            ["chat", "code", "orchestration", "review"].includes(view)
              ? ` ${VIEW_CONTAINER_WORKSPACE_CLASS}`
              : ""
          }`}
          data-view={view}
          key={view}
        >
          <DesktopRouteErrorBoundary
            label={activeItem?.label ?? "View"}
            onReturnToChat={() => setView("chat")}
            onRetry={() => {
              resetDesktopRoute(view);
              setRouteRetryNonce((current) => current + 1);
            }}
            resetKey={`${view}\u0000${projectScope}\u0000${workspace.currentPath}\u0000${routeRetryNonce}`}
          >
            <Suspense
              fallback={
                <DesktopRouteLoadingFallback
                  label={activeItem?.label ?? "view"}
                />
              }
            >
              {content}
            </Suspense>
          </DesktopRouteErrorBoundary>
        </div>
        {chatTerminalMounted ? (
          <Suspense fallback={null}>
            <ChatTerminalPanel
              active={backend.phase === "ready"}
              height={chatTerminalHeight}
              open={chatTerminalOpen}
              onClose={closeChatTerminal}
              onResize={setChatTerminalHeight}
              onSendToChat={(text) => {
                void openChatWithContext({
                  text,
                  workspacePath: workspace.currentPath,
                  projectScope,
                })
                  .then((accepted) => {
                    if (accepted) closeChatTerminal(false);
                  })
                  .catch(() => undefined);
              }}
              platform={window.doolittle.platform}
              workspacePath={workspace.currentPath}
            />
          </Suspense>
        ) : null}
      </section>
      {utilityOpen ? (
        <Suspense fallback={null}>
          <DesktopUtilityLayer
            activeView={view}
            activity={
              <Suspense fallback={null}>
                <ActivityCenter
                  active={backend.phase === "ready"}
                  error={activityResource.error}
                  events={activityResource.data?.events ?? []}
                  loading={activityResource.loading}
                  onOpenTarget={openActivityTarget}
                  reload={activityResource.reload}
                />
              </Suspense>
            }
            onClose={closeUtilities}
            onKeyDown={handleUtilityKeyDown}
            onPreload={(next) =>
              preloadDesktopRoute(next, backend.phase, workspace.currentPath)
            }
            onResize={setUtilityDrawerWidth}
            onSelect={setView}
            onToggleSection={toggleSection}
            openSections={openSections}
            utilityDrawerWidth={utilityDrawerWidth}
            utilityRef={utilityRef}
            mobileModal={isMobileSidebarMode}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
