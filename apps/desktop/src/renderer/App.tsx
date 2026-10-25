import type { BotCatalogResponse, BotSummary } from "@doolittle/contracts/bots";
import { WorkspaceShell } from "@doolittle/ui";
import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import { ArrowLeft } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  lazy,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActivityFeedResponse,
  BotConversationScope,
  BotConversationScopeResponse,
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
import {
  createDesktopNavigationHistory,
  desktopNavigationTarget,
  pushDesktopNavigationHistory,
} from "./app-shell/desktop-navigation-history";
import {
  resetDesktopRoute,
  warmDesktopRoute,
} from "./app-shell/desktop-route-registry";
import type { DesktopRouteFocusStore } from "./app-shell/route-focus-state";
import {
  APP_MAIN_CLASS,
  APP_SIDEBAR_CLASS,
  APP_SIDEBAR_DARWIN_CLASS,
  APP_SIDEBAR_DESKTOP_CLASS,
  APP_SIDEBAR_MOBILE_CLASS,
  APP_SIDEBAR_MOBILE_CLOSED_CLASS,
  APP_SIDEBAR_MOBILE_OPEN_CLASS,
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
import {
  applyShellOverlayState,
  utilityReturnFocusTarget,
} from "./app-shell/shell-overlay-state";
import { BotCreationConversation } from "./bots/BotCreationConversation";
import { BotCreationDialog } from "./bots/BotCreationDialog";
import { shouldReportBotActivationFailure } from "./bots/bot-activation-feedback";
import {
  latestBotSession,
  sessionBotId,
  visibleBots,
} from "./bots/bot-selection";
import { NewChatChooser } from "./bots/NewChatChooser";
import {
  loadSessionBindings,
  loadSessionProjectBindings,
  saveSessionBindings,
  saveSessionProjectBindings,
  sessionProjectTarget,
} from "./bots/session-bindings";
import { useBotCatalogPolling } from "./bots/useBotCatalogPolling";
import { DesktopRouteErrorBoundary } from "./components/DesktopRouteErrorBoundary";
import { useToasts } from "./components/ToastRegion";
import { useModalFocusBoundary } from "./components/useModalFocusBoundary";
import {
  type ComputerOrigin,
  computerOriginKey,
  ensureComputerOriginOwnerBinding,
  resolveTerminalConversationOrigin,
} from "./computer-origin";
import { observeContextMenuCopy } from "./context-menu-clipboard";
import { newConversationId } from "./conversation-id";
import {
  collectSidebarFocusables,
  desktopHashForView,
  loadProjectScope,
  MOBILE_SIDEBAR_QUERY,
  NAV_COLLAPSED_KEY,
  navigation,
  PROJECT_SCOPE_KEY,
  primaryViewForView,
  renderedViewForView,
  resolveDesktopHash,
  type View,
} from "./desktop-navigation";
import {
  loadStoredThemeManifest,
  THEME_MANIFEST_CHANGE_EVENT,
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
  minimumDockedUtilityViewportWidth,
  resolveUtilityPanelLayout,
  savePanelSize,
  savePanelWidth,
  UTILITY_DRAWER_WIDTH,
  UTILITY_DRAWER_WIDTH_KEY,
} from "./panel-layout";
import type { ProjectLike, ProjectScope } from "./project-manager/models";
import { projectNavigationTarget } from "./project-navigation";
import { resolveSessionConversationScope } from "./session-conversation-scope";
import { compactSessionPreview } from "./session-preview";
import {
  isCommandPaletteShortcut,
  shouldHandleGlobalChatTerminalShortcut,
  shouldIgnoreShellShortcut,
} from "./shell-shortcuts";
import { createTerminalOpenIntent } from "./terminal-open-intent";
import { useDesktopAppearance } from "./use-desktop-appearance";
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

const loadDesktopSidebar = () =>
  import("./app-shell/DesktopSidebar").then((module) => ({
    default: module.DesktopSidebar,
  }));

const LazyDesktopSidebar = lazy(loadDesktopSidebar);

function DesktopSidebarLoadingFallback({
  isMobileSidebarMode,
  mobileSidebarOpen,
  platform,
  sidebarRef,
}: {
  isMobileSidebarMode: boolean;
  mobileSidebarOpen: boolean;
  platform: "darwin" | "linux" | "win32";
  sidebarRef: RefObject<HTMLElement | null>;
}) {
  return (
    <aside
      aria-busy="true"
      aria-hidden={isMobileSidebarMode && !mobileSidebarOpen ? true : undefined}
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
          : ` ${APP_SIDEBAR_DESKTOP_CLASS}`
      }`}
      ref={sidebarRef}
      tabIndex={-1}
    />
  );
}

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
  const routeFocus = useRef<DesktopRouteFocusStore>(new Map());
  const [view, setViewState] = useState<View>(() => resolveDesktopHash().view);
  const [navigationHistory, setNavigationHistory] = useState(() =>
    createDesktopNavigationHistory(resolveDesktopHash().view),
  );
  const [routeRetryNonce, setRouteRetryNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [chatTerminalOpen, setChatTerminalOpen] = useState(false);
  const [chatTerminalMounted, setChatTerminalMounted] = useState(false);
  const [computerOrigin, setComputerOrigin] = useState<ComputerOrigin>();
  const computerOriginRef = useRef<ComputerOrigin | undefined>(undefined);
  const [terminalOrigin, setTerminalOrigin] = useState<ComputerOrigin>();
  const terminalOpenIntent = useRef(createTerminalOpenIntent());
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) === "true",
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadPanelWidth(localStorage, APP_SIDEBAR_WIDTH_KEY, {
      ...APP_SIDEBAR_WIDTH,
      default: loadStoredThemeManifest().geometry.navigationWidth,
    }),
  );
  const [utilityDrawerWidth, setUtilityDrawerWidth] = useState(() =>
    loadPanelWidth(localStorage, UTILITY_DRAWER_WIDTH_KEY, {
      ...UTILITY_DRAWER_WIDTH,
      default: loadStoredThemeManifest().geometry.inspectorWidth,
    }),
  );
  const [chatTerminalHeight, setChatTerminalHeight] = useState(() =>
    loadPanelSize(localStorage, CHAT_TERMINAL_HEIGHT_KEY, CHAT_TERMINAL_HEIGHT),
  );
  const explicitPanelSizesRef = useRef({
    sidebar: localStorage.getItem(APP_SIDEBAR_WIDTH_KEY) !== null,
    utility: localStorage.getItem(UTILITY_DRAWER_WIDTH_KEY) !== null,
  });
  const resizeSidebar = useCallback((width: number) => {
    explicitPanelSizesRef.current.sidebar = true;
    setSidebarWidth(width);
  }, []);
  const resizeUtilityDrawer = useCallback((width: number) => {
    explicitPanelSizesRef.current.utility = true;
    setUtilityDrawerWidth(width);
  }, []);
  const [projectScope, setProjectScope] =
    useState<ProjectScope>(loadProjectScope);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
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
  const [nativeSelectionRestored, setNativeSelectionRestored] = useState(
    () => !window.doolittle.ui,
  );
  const [selectedBotId, setSelectedBotId] = useState("");
  const [pendingCreatedBot, setPendingCreatedBot] = useState<BotSummary | null>(
    null,
  );
  const [localBotBindings, setLocalBotBindings] = useState<
    Record<string, string>
  >(() => loadSessionBindings(localStorage));
  useEffect(() => {
    saveSessionBindings(localStorage, localBotBindings);
  }, [localBotBindings]);
  const [localProjectBindings, setLocalProjectBindings] = useState<
    Record<string, string | null>
  >(() => ({
    ...loadSessionProjectBindings(localStorage),
    [initialConversation]:
      projectScope === "all" || projectScope === "unscoped"
        ? null
        : projectScope,
  }));
  const [confirmedConversationScopes, setConfirmedConversationScopes] =
    useState<Record<string, BotConversationScope>>({});
  useEffect(() => {
    saveSessionProjectBindings(localStorage, localProjectBindings);
  }, [localProjectBindings]);
  const captureSessionProject = useCallback(
    (id: string, projectId: string | null) => {
      setLocalProjectBindings((current) =>
        Object.hasOwn(current, id) ? current : { ...current, [id]: projectId },
      );
    },
    [],
  );
  const [botCreationOpen, setBotCreationOpen] = useState(false);
  const [botCreationDirty, setBotCreationDirty] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatBusy, setNewChatBusy] = useState(false);
  const [newChatError, setNewChatError] = useState("");
  const newChatBusyRef = useRef(false);
  const newChatNavigationRef = useRef({ selectedSession, view, revision: 0 });
  const previousChatNavigation = newChatNavigationRef.current;
  newChatNavigationRef.current = {
    selectedSession,
    view,
    revision:
      previousChatNavigation.revision +
      (previousChatNavigation.selectedSession !== selectedSession ||
      previousChatNavigation.view !== view
        ? 1
        : 0),
  };
  const [newChatScope, setNewChatScope] = useState<ProjectScope>(projectScope);
  const newChatTriggerRef = useRef<HTMLElement | null>(null);
  const [editingBot, setEditingBot] = useState<BotSummary | undefined>();
  const botCreationTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadDesktopSidebar()
      .then(() => {
        if (!cancelled) setSidebarReady(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const syncThemeGeometryDefaults = () => {
      const { geometry } = loadStoredThemeManifest();
      if (!explicitPanelSizesRef.current.sidebar) {
        setSidebarWidth(geometry.navigationWidth);
      }
      if (!explicitPanelSizesRef.current.utility) {
        setUtilityDrawerWidth(geometry.inspectorWidth);
      }
    };
    window.addEventListener(
      THEME_MANIFEST_CHANGE_EVENT,
      syncThemeGeometryDefaults,
    );
    return () =>
      window.removeEventListener(
        THEME_MANIFEST_CHANGE_EVENT,
        syncThemeGeometryDefaults,
      );
  }, []);
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
  useEffect(() => observeContextMenuCopy(pushToast), [pushToast]);
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
  const scopeForSession = useCallback(
    (id: string) =>
      resolveSessionConversationScope(
        id,
        sessions,
        confirmedConversationScopes,
        localProjectBindings,
      ),
    [sessions, confirmedConversationScopes, localProjectBindings],
  );
  const recordConversationScope = useCallback((scope: BotConversationScope) => {
    setConfirmedConversationScopes((current) => ({
      ...current,
      [scope.sessionId]: scope,
    }));
  }, []);
  const botResource = useApiResource<BotCatalogResponse>("/bots", [
    backend.phase,
  ]);
  const botCatalog = botResource.data;
  useEffect(() => {
    const refresh = () => {
      void botResource.reload();
    };
    const edit = (event: Event) => {
      const id = (event as CustomEvent<{ botId?: string }>).detail?.botId;
      const bot = botCatalog?.bots.find(
        (entry) =>
          entry.id === id &&
          !entry.isDefault &&
          (entry.state === "stopped" || entry.state === "error"),
      );
      if (!bot) return;
      botCreationTriggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setEditingBot(bot);
    };
    window.addEventListener("doolittle:bot-catalog-changed", refresh);
    window.addEventListener("doolittle:edit-bot", edit);
    return () => {
      window.removeEventListener("doolittle:bot-catalog-changed", refresh);
      window.removeEventListener("doolittle:edit-bot", edit);
    };
  }, [botCatalog, botResource.reload]);
  const defaultBotId = botCatalog?.defaultBotId ?? "";
  const bots = useMemo(() => {
    const catalogBots = visibleBots(botCatalog);
    return pendingCreatedBot &&
      !catalogBots.some((bot) => bot.id === pendingCreatedBot.id)
      ? [...catalogBots, pendingCreatedBot]
      : catalogBots;
  }, [botCatalog, pendingCreatedBot]);
  const selectedBot =
    bots.find((bot) => bot.id === selectedBotId) ??
    bots.find((bot) => bot.id === defaultBotId) ??
    null;
  useEffect(() => {
    if (!defaultBotId) return;
    setSelectedBotId((current) =>
      current && bots.some((bot) => bot.id === current)
        ? current
        : defaultBotId,
    );
    setLocalBotBindings((current) =>
      current[initialConversation]
        ? current
        : { ...current, [initialConversation]: defaultBotId },
    );
  }, [bots, defaultBotId, initialConversation]);
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
  const [canvasLayout, setCanvasLayout] = useState(
    () => document.documentElement.dataset.uiLayout === "canvas",
  );
  useEffect(() => {
    const syncLayout = () =>
      setCanvasLayout(document.documentElement.dataset.uiLayout === "canvas");
    window.addEventListener("doolittle:ui-layout-change", syncLayout);
    return () =>
      window.removeEventListener("doolittle:ui-layout-change", syncLayout);
  }, []);
  const isMobileSidebarMode =
    useMediaQuery(MOBILE_SIDEBAR_QUERY) || canvasLayout;
  const mobileSidebarOpen = sidebarOpen && isMobileSidebarMode;
  const minimumExpandedUtilityDockWidth = minimumDockedUtilityViewportWidth({
    navCollapsed: false,
    sidebarWidth,
    utilityWidth: utilityDrawerWidth,
  });
  const minimumCollapsedUtilityDockWidth = minimumDockedUtilityViewportWidth({
    navCollapsed: true,
    sidebarWidth,
    utilityWidth: utilityDrawerWidth,
  });
  const canDockWithExpandedNavigation = useMediaQuery(
    `(min-width: ${minimumExpandedUtilityDockWidth}px)`,
  );
  const canDockWithCollapsedNavigation = useMediaQuery(
    `(min-width: ${minimumCollapsedUtilityDockWidth}px)`,
  );
  const {
    effectiveNavCollapsed,
    navigationAutoCollapsed,
    utilityModalMode,
    utilityDocked,
  } = resolveUtilityPanelLayout({
    isMobileSidebarMode,
    utilityOpen,
    navCollapsed,
    canDockWithExpandedNavigation,
    canDockWithCollapsedNavigation,
    // Settings keeps its geometry; utilities become a sheet before borrowing
    // navigation width from an active settings form.
    allowNavigationAutoCollapse: primaryViewForView(view) !== "settings",
  });

  const setMobileSidebarOpen = useCallback(
    (open: boolean, restoreFocus = true) => {
      setSidebarOpen(open);
      if (!open) {
        const restoreTarget = sidebarReturnFocusRef.current;
        if (restoreTarget?.isConnected) {
          if (restoreFocus) {
            requestAnimationFrame(() => restoreTarget.focus());
          }
        }
        sidebarReturnFocusRef.current = null;
      }
    },
    [],
  );

  const openProjectManager = useCallback(() => {
    setMobileSidebarOpen(false);
    setProjectManagerOpen(true);
  }, [setMobileSidebarOpen]);

  const openCommandPalette = useCallback(() => {
    if (utilityOpen && utilityModalMode) {
      setUtilityOpen(false);
    }
    paletteReturnFocusRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    void preloadCommandPalette();
    setPaletteMounted(true);
    setPaletteOpen(true);
  }, [utilityModalMode, utilityOpen]);

  const closeUtilities = useCallback(() => {
    setUtilityOpen(false);
    const restoreTarget = utilityReturnFocusRef.current;
    utilityReturnFocusRef.current = null;
    if (restoreTarget?.isConnected) {
      requestAnimationFrame(() => restoreTarget.focus());
    }
  }, []);

  const openUtilities = useCallback(() => {
    if (utilityModalMode) {
      setPaletteOpen(false);
      setPaletteQuery("");
      terminalOpenIntent.current.cancel();
      setChatTerminalOpen(false);
    }
    utilityReturnFocusRef.current = utilityReturnFocusTarget({
      activeElement:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      mobileSidebarOpen,
      sidebarReturnTarget: sidebarReturnFocusRef.current,
    });
    setMobileSidebarOpen(false, !mobileSidebarOpen);
    setUtilityOpen(true);
  }, [mobileSidebarOpen, setMobileSidebarOpen, utilityModalMode]);

  const toggleUtilities = useCallback(() => {
    if (utilityOpen) closeUtilities();
    else openUtilities();
  }, [closeUtilities, openUtilities, utilityOpen]);

  const terminalContextKey = JSON.stringify([
    selectedSession,
    view,
    workspace.currentPath,
    projectScope,
    computerOriginKey(computerOrigin),
    computerOrigin?.workspacePath,
  ]);
  useLayoutEffect(() => {
    const intent = terminalOpenIntent.current;
    intent.setContext(terminalContextKey);
    return () => intent.cancel();
  }, [terminalContextKey]);

  const closeChatTerminal = useCallback((restoreFocus = true) => {
    terminalOpenIntent.current.cancel();
    setChatTerminalOpen(false);
    const restoreTarget = chatTerminalReturnFocusRef.current;
    chatTerminalReturnFocusRef.current = null;
    if (restoreFocus && restoreTarget?.isConnected) {
      requestAnimationFrame(() => restoreTarget.focus());
    }
  }, []);

  const openChatTerminal = useCallback(() => {
    const owner = sessionBotId(
      selectedSession,
      sessions,
      localBotBindings,
      defaultBotId,
    );
    const scope = scopeForSession(selectedSession);
    const origin =
      (renderedViewForView(view) === "code" ||
      renderedViewForView(view) === "browser"
        ? computerOrigin
        : undefined) ??
      (owner
        ? {
            botId: owner,
            originConversationId: selectedSession,
            workspacePath:
              scope.kind === "confirmed"
                ? scope.conversation.workspacePath
                : "",
          }
        : undefined);
    if (!origin) {
      pushToast({
        tone: "error",
        title: "Computer is unavailable",
        message: "Select a bot conversation before opening Computer.",
      });
      return;
    }
    const originScope = scopeForSession(origin.originConversationId);
    if (
      originScope.kind === "unknown" ||
      (originScope.kind === "pending" && originScope.projectId)
    ) {
      pushToast({
        tone: "error",
        title: "Terminal is unavailable",
        message:
          "This chat has no confirmed workspace. Start a new chat in the intended project.",
      });
      return;
    }
    const returnFocusTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let prepared: Awaited<ReturnType<typeof resolveTerminalConversationOrigin>>;
    void terminalOpenIntent.current.run(
      terminalContextKey,
      async () => {
        prepared = await resolveTerminalConversationOrigin(
          origin,
          originScope,
          {
            freshScratchDraftIds: new Set(
              renderedViewForView(view) === "chat" &&
                (projectScope === "all" || projectScope === "unscoped")
                ? [initialConversation]
                : [],
            ),
            savedSessionIds: new Set(
              sessions.map((session) => session.sessionId),
            ),
            localBotBindings,
            bind: async (botId, sessionId, boundProjectId) => {
              const response =
                await desktopRequest<BotConversationScopeResponse>(
                  `/bots/${encodeURIComponent(botId)}/conversations`,
                  "POST",
                  {
                    sessionId,
                    ...(boundProjectId ? { projectId: boundProjectId } : {}),
                  },
                );
              return response.conversation;
            },
          },
        );
      },
      () => {
        recordConversationScope(prepared.conversation);
        setTerminalOrigin(prepared.origin);
        if (utilityOpen && utilityModalMode) {
          setUtilityOpen(false);
        }
        chatTerminalReturnFocusRef.current = returnFocusTarget;
        setMobileSidebarOpen(false);
        setChatTerminalMounted(true);
        setChatTerminalOpen(true);
      },
      () => {
        pushToast({
          tone: "error",
          title: "Terminal is unavailable",
          message:
            "This draft’s bot ownership could not be confirmed. The draft was kept.",
        });
      },
    );
  }, [
    setMobileSidebarOpen,
    utilityModalMode,
    utilityOpen,
    selectedSession,
    initialConversation,
    projectScope,
    sessions,
    localBotBindings,
    defaultBotId,
    computerOrigin,
    view,
    scopeForSession,
    recordConversationScope,
    terminalContextKey,
    pushToast,
  ]);

  const toggleChatTerminal = useCallback(() => {
    if (chatTerminalOpen || terminalOpenIntent.current.isPending())
      closeChatTerminal();
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
        primaryViewForView(view) === "code" &&
        primaryViewForView(next) !== "code" &&
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
      {
        skipDirtyCheck = false,
        computerOrigin: suppliedOrigin,
      }: { skipDirtyCheck?: boolean; computerOrigin?: ComputerOrigin } = {},
    ) => {
      if (!skipDirtyCheck && !confirmViewChange(next)) return false;
      const computer =
        renderedViewForView(next) === "code" ||
        renderedViewForView(next) === "browser";
      const owner = sessionBotId(
        selectedSession,
        sessions,
        localBotBindings,
        defaultBotId,
      );
      const selectedScope = scopeForSession(selectedSession);
      const origin = computer
        ? (suppliedOrigin ??
          (owner
            ? {
                botId: owner,
                originConversationId: selectedSession,
                workspacePath:
                  selectedScope.kind === "confirmed"
                    ? selectedScope.conversation.workspacePath
                    : "",
              }
            : undefined))
        : undefined;
      if (
        !skipDirtyCheck &&
        computer &&
        renderedViewForView(view) === "code" &&
        JSON.stringify(computerOriginRef.current) !== JSON.stringify(origin) &&
        !confirmDirtyNavigation({
          dirty: codeWorkspaceDirty,
          confirm: () =>
            window.confirm(
              "This coding workspace has unsaved edits. Change its owner and discard them?",
            ),
          discard: () => setCodeWorkspaceDirty(false),
        })
      )
        return false;
      computerOriginRef.current = origin && { ...origin };
      setComputerOrigin(computerOriginRef.current);
      void warmDesktopRoute(next, backend.phase, workspace.currentPath).catch(
        () => undefined,
      );
      setViewState(next);
      setMobileSidebarOpen(false);
      if (utilityModalMode) closeUtilities();
      return true;
    },
    [
      backend.phase,
      closeUtilities,
      confirmViewChange,
      utilityModalMode,
      workspace.currentPath,
      setMobileSidebarOpen,
      selectedSession,
      sessions,
      localBotBindings,
      defaultBotId,
      scopeForSession,
      view,
      codeWorkspaceDirty,
    ],
  );

  // Keep one hashchange listener for the lifetime of the shell. Re-registering
  // it on every view render leaves a narrow gap where rapid browser history or
  // compact-layout navigation can update the hash without updating the view.
  const recordNavigation = useCallback((next: View) => {
    setNavigationHistory((current) =>
      pushDesktopNavigationHistory(current, next, computerOriginRef.current),
    );
  }, []);
  const hashNavigationRef = useRef({
    applyViewTransition,
    recordNavigation,
    view,
  });
  hashNavigationRef.current = { applyViewTransition, recordNavigation, view };

  const setView = useCallback(
    (
      next: View,
      options?: {
        readonly skipDirtyCheck?: boolean;
        readonly computerOrigin?: ComputerOrigin;
      },
    ) => {
      if (options?.skipDirtyCheck) {
        if (!applyViewTransition(next, options)) return false;
      } else if (!applyViewTransition(next, options)) return false;
      recordNavigation(next);
      window.location.hash = desktopHashForView(next);
      return true;
    },
    [applyViewTransition, recordNavigation],
  );

  useEffect(() => {
    if (
      !computerOrigin &&
      defaultBotId &&
      (renderedViewForView(view) === "code" ||
        renderedViewForView(view) === "browser")
    ) {
      applyViewTransition(view, { skipDirtyCheck: true });
      setNavigationHistory((current) => ({
        ...current,
        computerOrigins: computerOriginRef.current
          ? {
              ...current.computerOrigins,
              [current.index]: { ...computerOriginRef.current },
            }
          : current.computerOrigins,
      }));
    }
  }, [computerOrigin, defaultBotId, view, applyViewTransition]);

  const traverseNavigationHistory = useCallback(
    (offset: -1 | 1) => {
      const target = desktopNavigationTarget(navigationHistory, offset);
      if (
        !target ||
        !applyViewTransition(target.view, {
          computerOrigin: target.computerOrigin,
        })
      )
        return;
      setNavigationHistory(target.history);
      window.history.replaceState(null, "", desktopHashForView(target.view));
    },
    [applyViewTransition, navigationHistory],
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
      if (!utilityModalMode || event.key !== "Tab") return;

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
    [closeUtilities, utilityModalMode, utilityOpen],
  );

  const createConversation = useCallback(() => {
    if (newChatBusyRef.current) return;
    newChatTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setNewChatScope(
      projectScope !== "all" &&
        projectScope !== "unscoped" &&
        projects.some(
          (project) =>
            project.id === projectScope &&
            project.primaryPath &&
            !project.archivedAt,
        )
        ? projectScope
        : "unscoped",
    );
    setNewChatError("");
    setNewChatOpen(true);
  }, [projectScope, projects]);

  useEffect(() => {
    window.addEventListener("doolittle:new-chat", createConversation);
    return () =>
      window.removeEventListener("doolittle:new-chat", createConversation);
  }, [createConversation]);

  const { resolvedAppearance, setAppearance } = useDesktopAppearance(
    backend.phase,
  );

  const toggleAppearance = useCallback(() => {
    const nextAppearance = resolvedAppearance === "dark" ? "light" : "dark";
    setAppearance(nextAppearance);
    pushToast({
      tone: "success",
      title: `${nextAppearance === "dark" ? "Dark" : "Light"} appearance`,
      message: "Your desktop preference was saved.",
    });
  }, [pushToast, resolvedAppearance, setAppearance]);

  const toggleNavigation = useCallback(() => {
    setNavCollapsed((value) => !value);
  }, []);

  const toggleInspector = useCallback(() => {
    window.dispatchEvent(new CustomEvent("doolittle:toggle-inspector"));
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
    captureSessionProject,
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
      if (newChatBusyRef.current) return;
      newChatTriggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setNewChatScope(
        scope !== "all" &&
          scope !== "unscoped" &&
          projects.some(
            (project) =>
              project.id === scope &&
              project.primaryPath &&
              !project.archivedAt,
          )
          ? scope
          : "unscoped",
      );
      setNewChatError("");
      setNewChatOpen(true);
    },
    [projects],
  );

  const chooseChatBot = useCallback(
    async (botId: string) => {
      if (newChatBusyRef.current) return;
      if (
        botCreationOpen &&
        !confirmDirtyNavigation({
          dirty: botCreationDirty,
          confirm: () =>
            window.confirm(
              "Discard this unsaved bot design and start another chat?",
            ),
          discard: () => undefined,
        })
      )
        return;
      const bot = bots.find((entry) => entry.id === botId && !entry.archivedAt);
      if (!bot) return;
      if (!confirmViewChange("chat")) return;
      const id = newConversationId();
      const scope = newChatScope;
      const navigationAtChoice = { ...newChatNavigationRef.current };
      newChatBusyRef.current = true;
      setNewChatBusy(true);
      setNewChatError("");
      try {
        const projectId =
          scope === "all" || scope === "unscoped" ? undefined : scope;
        const bound = await desktopRequest<BotConversationScopeResponse>(
          `/bots/${encodeURIComponent(bot.id)}/conversations`,
          "POST",
          {
            sessionId: id,
            ...(projectId ? { projectId, consent: true } : {}),
          },
        );
        if (
          !bound.conversation ||
          bound.conversation.sessionId !== id ||
          bound.conversation.botId !== bot.id
        )
          throw new Error("Binding mismatch");
        if (bound.conversation.projectId !== projectId)
          throw new Error("Binding mismatch");
        if (
          newChatNavigationRef.current.selectedSession !==
            navigationAtChoice.selectedSession ||
          newChatNavigationRef.current.view !== navigationAtChoice.view ||
          newChatNavigationRef.current.revision !== navigationAtChoice.revision
        ) {
          setNewChatError(
            "The chat was created, but navigation changed while access was confirmed. Open the bot to find it.",
          );
          return;
        }
        const previousSelection = await window.doolittle.ui?.getSnapshot();
        if (
          newChatNavigationRef.current.selectedSession !==
            navigationAtChoice.selectedSession ||
          newChatNavigationRef.current.view !== navigationAtChoice.view ||
          newChatNavigationRef.current.revision !== navigationAtChoice.revision
        )
          return;
        // Persist the exact host-confirmed tuple before a reload can occur.
        // The session inventory may not yet contain this empty conversation.
        const selected = await window.doolittle.ui?.dispatch({
          type: "conversation.select",
          target: {
            botId: bot.id,
            sessionId: id,
            ...(projectId ? { projectId } : {}),
          },
        });
        if (selected && !selected.accepted)
          throw new Error("Conversation selection was not accepted");
        if (
          newChatNavigationRef.current.selectedSession !==
            navigationAtChoice.selectedSession ||
          newChatNavigationRef.current.view !== navigationAtChoice.view ||
          newChatNavigationRef.current.revision !== navigationAtChoice.revision
        ) {
          // Native selection may have completed while the user navigated. Keep
          // the latest confirmed chat, or the prior host selection for a draft.
          const currentScope = scopeForSession(
            newChatNavigationRef.current.selectedSession,
          );
          const currentTarget =
            currentScope.kind === "confirmed"
              ? {
                  botId: currentScope.conversation.botId,
                  sessionId: currentScope.conversation.sessionId,
                  ...(currentScope.conversation.projectId
                    ? { projectId: currentScope.conversation.projectId }
                    : {}),
                }
              : previousSelection?.selected;
          if (currentTarget)
            await window.doolittle.ui?.dispatch({
              type: "conversation.select",
              target: currentTarget,
            });
          setNewChatError(
            "The chat was created, but navigation changed while access was confirmed. Open the bot to find it.",
          );
          return;
        }
        if (setView("chat", { skipDirtyCheck: true })) {
          setNewChatOpen(false);
          setBotCreationOpen(false);
          setSelectedBotId(bot.id);
          setConfirmedConversationScopes((current) => ({
            ...current,
            [id]: bound.conversation,
          }));
          setLocalBotBindings((current) => ({ ...current, [id]: bot.id }));
          captureSessionProject(id, bound.conversation.projectId ?? null);
          setProjectScope(bound.conversation.projectId ?? "unscoped");
          setSelectedSession(id);
        }
      } catch {
        setNewChatError(
          "This conversation could not be opened. Your current draft was kept. Try again.",
        );
      } finally {
        newChatBusyRef.current = false;
        setNewChatBusy(false);
      }
    },
    [
      bots,
      newChatScope,
      captureSessionProject,
      scopeForSession,
      setView,
      botCreationOpen,
      botCreationDirty,
      confirmViewChange,
    ],
  );

  const openBot = useCallback(
    (botId: string) => {
      if (!bots.some((bot) => bot.id === botId)) return;
      if (!setView("chat")) return;
      setSelectedBotId(botId);
      const latest = latestBotSession(sessions, botId, defaultBotId);
      if (latest) {
        setSelectedSession(latest.sessionId);
      } else {
        const id = newConversationId();
        setLocalBotBindings((current) => ({ ...current, [id]: botId }));
        captureSessionProject(id, null);
        setSelectedSession(id);
      }
    },
    [bots, defaultBotId, sessions, setView, captureSessionProject],
  );

  const openCreateBot = useCallback(() => {
    if (!setView("chat")) return;
    if (botCreationOpen) {
      setNewChatOpen(false);
      return;
    }
    botCreationTriggerRef.current = newChatOpen
      ? newChatTriggerRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setNewChatOpen(false);
    setBotCreationDirty(false);
    setBotCreationOpen(true);
  }, [newChatOpen, setView, botCreationOpen]);

  const activateBot = useCallback(
    async (botId: string) => {
      try {
        const startup = desktopRequest<BotSummary>(
          `/bots/${encodeURIComponent(botId)}/activate`,
          "POST",
        );
        botResource.reload();
        const activated = await startup;
        setPendingCreatedBot((current) =>
          current?.id === botId ? activated : current,
        );
        if (["ready", "busy", "waiting"].includes(activated.state)) {
          pushToast({
            tone: "success",
            title: `${activated.name} ready`,
            message: "Ready for a conversation.",
          });
        }
      } catch (error) {
        if (!shouldReportBotActivationFailure(error)) return;
        pushToast({
          tone: "error",
          title: "Bot startup failed",
          message: "Check its connection and retry from this conversation.",
        });
      } finally {
        botResource.reload();
      }
    },
    [botResource.reload, pushToast],
  );
  const onBotCreated = useCallback(
    async (bot: BotSummary) => {
      setBotCreationOpen(false);
      setBotCreationDirty(false);
      setPendingCreatedBot(bot);
      const id = newConversationId();
      try {
        const bound = await desktopRequest<BotConversationScopeResponse>(
          `/bots/${encodeURIComponent(bot.id)}/conversations`,
          "POST",
          { sessionId: id },
        );
        if (
          bound.conversation.sessionId !== id ||
          bound.conversation.botId !== bot.id
        )
          throw new Error("Binding mismatch");
        setConfirmedConversationScopes((current) => ({
          ...current,
          [id]: bound.conversation,
        }));
      } catch {
        pushToast({
          tone: "error",
          title: "Bot saved, chat unavailable",
          message:
            "The bot was saved, but its private chat could not be created. Open the bot to retry.",
        });
        return;
      }
      setSelectedBotId(bot.id);
      setLocalBotBindings((current) => ({ ...current, [id]: bot.id }));
      captureSessionProject(id, null);
      setSelectedSession(id);
      setView("chat");
      pushToast({
        tone: "success",
        title: `${bot.name} saved`,
        message:
          "Starting in its private scratch chat. Project access can be chosen for another chat.",
      });
      // Save and bind the conversation first. A failed warm-up must not lose
      // the character or trigger unrelated, manually stopped bots.
      void activateBot(bot.id);
    },
    [activateBot, pushToast, setView, captureSessionProject],
  );

  const startChatInProject = useCallback(
    async (projectId: string | null, sourceSessionId = selectedSession) => {
      if (newChatBusyRef.current)
        throw new Error("A chat is already being opened.");
      if (!confirmViewChange("chat"))
        throw new Error("Navigation canceled; the current chat was kept.");
      const navigationAtChoice = { ...newChatNavigationRef.current };
      const botId = sessionBotId(
        sourceSessionId,
        sessions,
        localBotBindings,
        defaultBotId,
      );
      if (!botId) throw new Error("Chat owner unavailable");
      newChatBusyRef.current = true;
      try {
        const sessionId = newConversationId();
        const response = await desktopRequest<BotConversationScopeResponse>(
          `/bots/${encodeURIComponent(botId)}/conversations`,
          "POST",
          { sessionId, ...(projectId ? { projectId, consent: true } : {}) },
        );
        if (
          response.conversation.sessionId !== sessionId ||
          response.conversation.botId !== botId ||
          response.conversation.projectId !== (projectId ?? undefined)
        )
          throw new Error("Conversation scope mismatch");
        if (
          newChatNavigationRef.current.selectedSession !==
            navigationAtChoice.selectedSession ||
          newChatNavigationRef.current.view !== navigationAtChoice.view ||
          newChatNavigationRef.current.revision !== navigationAtChoice.revision
        )
          throw new Error(
            "Navigation changed while project access was confirmed. The current chat was kept.",
          );
        const previousSelection = await window.doolittle.ui?.getSnapshot();
        const navigationChanged = () =>
          newChatNavigationRef.current.selectedSession !==
            navigationAtChoice.selectedSession ||
          newChatNavigationRef.current.view !== navigationAtChoice.view ||
          newChatNavigationRef.current.revision !== navigationAtChoice.revision;
        if (navigationChanged())
          throw new Error("Navigation changed while opening the chat.");
        const selection = await window.doolittle.ui?.dispatch({
          type: "conversation.select",
          target: { botId, sessionId, ...(projectId ? { projectId } : {}) },
        });
        if (selection && !selection.accepted)
          throw new Error("Chat selection was not accepted.");
        if (navigationChanged()) {
          const latest = scopeForSession(
            newChatNavigationRef.current.selectedSession,
          );
          const target =
            latest.kind === "confirmed"
              ? {
                  botId: latest.conversation.botId,
                  sessionId: latest.conversation.sessionId,
                  ...(latest.conversation.projectId
                    ? { projectId: latest.conversation.projectId }
                    : {}),
                }
              : previousSelection?.selected;
          if (target)
            await window.doolittle.ui?.dispatch({
              type: "conversation.select",
              target,
            });
          throw new Error("Navigation changed while opening the chat.");
        }
        recordConversationScope(response.conversation);
        setLocalBotBindings((current) => ({ ...current, [sessionId]: botId }));
        captureSessionProject(sessionId, projectId);
        setSelectedSession(sessionId);
        setSelectedBotId(botId);
        setProjectScope(projectId ?? "unscoped");
        setView("chat", { skipDirtyCheck: true });
      } finally {
        newChatBusyRef.current = false;
      }
    },
    [
      selectedSession,
      confirmViewChange,
      sessions,
      localBotBindings,
      defaultBotId,
      recordConversationScope,
      scopeForSession,
      captureSessionProject,
      setView,
    ],
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
    startChatInProject,
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
    openScopedContextChat: async (resolution, onActivated) => {
      if (!confirmViewChange("chat")) return false;
      const selection = { ...newChatNavigationRef.current };
      const saved = sessions.find(
        (session) => session.sessionId === resolution.sessionId,
      );
      const knownScope = scopeForSession(resolution.sessionId);
      const botId =
        resolution.handoff.origin?.botId ??
        (knownScope.kind === "confirmed"
          ? knownScope.conversation.botId
          : undefined) ??
        saved?.botId ??
        sessionBotId(selectedSession, sessions, localBotBindings, defaultBotId);
      if (!botId) return false;
      const projectId =
        resolution.handoff.origin && knownScope.kind === "confirmed"
          ? knownScope.conversation.projectId
          : resolution.scope === "all" || resolution.scope === "unscoped"
            ? undefined
            : resolution.scope;
      const response = await desktopRequest<BotConversationScopeResponse>(
        `/bots/${encodeURIComponent(botId)}/conversations`,
        "POST",
        {
          sessionId: resolution.sessionId,
          ...(projectId ? { projectId, consent: true } : {}),
        },
      );
      const bound = response.conversation;
      if (
        bound.botId !== botId ||
        bound.sessionId !== resolution.sessionId ||
        bound.projectId !== projectId ||
        !pathsEqual(bound.workspacePath, resolution.handoff.workspacePath)
      )
        throw new Error("Context destination scope changed.");
      if (
        selection.selectedSession !==
          newChatNavigationRef.current.selectedSession ||
        selection.view !== newChatNavigationRef.current.view ||
        selection.revision !== newChatNavigationRef.current.revision
      )
        return false;
      recordConversationScope(bound);
      setLocalBotBindings((current) => ({
        ...current,
        [bound.sessionId]: botId,
      }));
      captureSessionProject(bound.sessionId, projectId ?? null);
      setSelectedSession(bound.sessionId);
      setSelectedBotId(botId);
      setView("chat", { skipDirtyCheck: true });
      return onActivated();
    },
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
    selectSession: setSelectedSession,
    setView,
    switchToRecentWorkspace,
    transitionToProjectScope,
    workspacePath: workspace.currentPath,
    botIdForSession: (id) =>
      sessionBotId(id, sessions, localBotBindings, defaultBotId),
  });

  const botIdForSession = useCallback(
    (sessionId: string) =>
      sessionBotId(sessionId, sessions, localBotBindings, defaultBotId),
    [defaultBotId, localBotBindings, sessions],
  );
  const projectTargetForSession = useCallback(
    (id: string) => sessionProjectTarget(id, sessions, localProjectBindings),
    [sessions, localProjectBindings],
  );
  const bindSessionBot = useCallback((sessionId: string, botId: string) => {
    if (!sessionId || !botId) return;
    setLocalBotBindings((current) =>
      current[sessionId] === botId
        ? current
        : { ...current, [sessionId]: botId },
    );
  }, []);
  const selectedSessionOwner = botIdForSession(selectedSession);
  useEffect(() => {
    const owner = selectedSessionOwner;
    if (owner && owner !== selectedBotId) setSelectedBotId(owner);
  }, [selectedSessionOwner, selectedBotId]);

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
    if (!utilityOpen || !utilityModalMode) return;
    requestAnimationFrame(() => {
      const [first] = collectSidebarFocusables(utilityRef.current);
      (first || utilityRef.current)?.focus();
    });
  }, [utilityModalMode, utilityOpen]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const appMain = appMainRef.current;
    if (!sidebar || !appMain) return;

    applyShellOverlayState(
      { appMain, sidebar },
      {
        isMobileSidebarMode,
        mobileSidebarOpen,
        utilityModalOpen: utilityOpen && utilityModalMode,
      },
    );

    if (utilityOpen && utilityModalMode) return;

    if (mobileSidebarOpen) {
      if (!sidebarReturnFocusRef.current) {
        sidebarReturnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      if (sidebarReady) {
        requestAnimationFrame(() => {
          const [first] = collectSidebarFocusables(sidebar);
          (first || sidebar).focus();
        });
      }
      return;
    }

    const returnTarget = sidebarReturnFocusRef.current;
    if (returnTarget?.isConnected) {
      requestAnimationFrame(() => returnTarget.focus());
    }
    sidebarReturnFocusRef.current = null;
  }, [
    isMobileSidebarMode,
    mobileSidebarOpen,
    sidebarReady,
    utilityModalMode,
    utilityOpen,
  ]);

  useEffect(() => {
    const onHashChange = () => {
      const resolved = resolveDesktopHash();
      const next = resolved.view;
      const current = hashNavigationRef.current;
      if (
        !current.applyViewTransition(next) &&
        window.location.hash !== desktopHashForView(current.view)
      ) {
        window.history.replaceState(null, "", desktopHashForView(current.view));
        return;
      }
      current.recordNavigation(next);
      if (window.location.hash !== resolved.canonicalHash) {
        window.history.replaceState(null, "", resolved.canonicalHash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash)
      window.location.hash = desktopHashForView("chat");
    else onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onChatTerminalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.documentElement.dataset.nativeInterfaceVisible === "false")
        return;
      if (!shouldHandleGlobalChatTerminalShortcut(view, event)) return;
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
      if (document.documentElement.dataset.nativeInterfaceVisible === "false")
        return;
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

  const openInterfaceSettings = useEffectEvent(() => {
    // Interface recovery may request Settings before the shell mounts. Consume
    // that one-shot request here so the URL and selected section stay aligned.
    delete document.documentElement.dataset.interfaceSettings;
    setView("interfaces");
  });
  const revealNativeSurface = useEffectEvent(
    (target: { botId: string; sessionId: string; projectId?: string }) => {
      bindSessionBot(target.sessionId, target.botId);
      captureSessionProject(target.sessionId, target.projectId ?? null);
      setSelectedBotId(target.botId);
      setSelectedSession(target.sessionId);
      setView("chat");
    },
  );
  useEffect(() => {
    const openInterfaces = () => openInterfaceSettings();
    window.addEventListener("doolittle:interface-settings", openInterfaces);
    if (document.documentElement.dataset.interfaceSettings === "true") {
      openInterfaces();
    }
    const detach = window.doolittle.ui?.onSurface(({ target }) => {
      revealNativeSurface(target);
    });
    const bridge = window.doolittle.ui;
    let disposed = false;
    let generation = 0;
    const restoreSelection = () => {
      const request = ++generation;
      void bridge
        ?.getSnapshot()
        .then((snapshot) => {
          if (disposed || request !== generation || !snapshot.selected) return;
          const target = snapshot.selected;
          bindSessionBot(target.sessionId, target.botId);
          captureSessionProject(target.sessionId, target.projectId ?? null);
          setSelectedBotId(target.botId);
          setSelectedSession(target.sessionId);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!disposed && request === generation)
            setNativeSelectionRestored(true);
        });
    };
    restoreSelection();
    const detachState = bridge?.onState((state) => {
      generation++;
      if (state.mode === "default") restoreSelection();
    });
    return () => {
      disposed = true;
      detachState?.();
      detach?.();
      window.removeEventListener(
        "doolittle:interface-settings",
        openInterfaces,
      );
    };
  }, [bindSessionBot, captureSessionProject]);

  const selectedNativeScope = scopeForSession(selectedSession);
  const selectedNativeProjectId =
    selectedNativeScope.kind === "confirmed"
      ? selectedNativeScope.conversation.projectId
      : undefined;
  const selectedNativeScopeConfirmed = selectedNativeScope.kind === "confirmed";
  useEffect(() => {
    if (!nativeSelectionRestored) return;
    if (document.documentElement.dataset.nativeInterfaceVisible === "false")
      return;
    const bridge = window.doolittle.ui;
    if (!selectedSessionOwner || !bridge || !selectedNativeScopeConfirmed)
      return;
    void bridge
      .dispatch({
        type: "conversation.select",
        target: {
          botId: selectedSessionOwner,
          sessionId: selectedSession,
          ...(selectedNativeProjectId
            ? { projectId: selectedNativeProjectId }
            : {}),
        },
      })
      .catch(() => undefined);
  }, [
    nativeSelectionRestored,
    selectedSession,
    selectedSessionOwner,
    selectedNativeProjectId,
    selectedNativeScopeConfirmed,
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

  useBotCatalogPolling(backend.phase === "ready", botResource);

  useIntervalWhenDocumentVisible(
    () => {
      if (utilityOpen) activityResource.reload();
      approvalsResource.reload();
      tasksResource.reload();
    },
    15_000,
    backend.phase === "ready",
  );

  const navigationView = primaryViewForView(view);
  const renderedView = renderedViewForView(view);
  const activeSection = navigation.find((section) =>
    section.items.some((item) => item.id === view),
  );
  const activeItem = activeSection?.items.find((item) => item.id === view);
  const labelForView = useCallback(
    (target?: View) =>
      target
        ? navigation
            .flatMap((section) => section.items)
            .find((item) => item.id === target)?.label
        : undefined,
    [],
  );
  const pendingApprovals = asArray(approvalsResource.data?.approvals).length;
  const runningTasks = asArray(tasksResource.data?.tasks).length;
  const activeProject =
    projectScope === "all" || projectScope === "unscoped"
      ? null
      : (projects.find((project) => project.id === projectScope) ?? null);
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
      sessions.filter(
        (session) =>
          (projectScope === "all"
            ? true
            : projectScope === "unscoped"
              ? !session.projectId
              : session.projectId === projectScope) &&
          (session.botId ?? defaultBotId) === (selectedBotId || defaultBotId),
      ),
    [defaultBotId, projectScope, selectedBotId, sessions],
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
  const selectedConversationScope = scopeForSession(selectedSession);
  const selectedSessionProjectId =
    selectedConversationScope.kind === "confirmed"
      ? (selectedConversationScope.conversation.projectId ?? null)
      : null;
  const selectedSessionSummary = sessions.find(
    (session) => session.sessionId === selectedSession,
  );
  const currentRouteLabel =
    view === "chat"
      ? compactSessionPreview(selectedSessionSummary?.title ?? "") ||
        "New conversation"
      : (activeItem?.label ?? "Desktop");
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

  const routeContent = (routeView: View) => (
    <DesktopRouteContent
      activeProject={activeProject}
      approvalsResource={approvalsResource}
      tasksResource={tasksResource}
      backend={backend}
      chatChromeHost={chatChromeHost}
      chatRouteActive={chatRouteActive}
      codeEditingLocked={codeEditingLocked}
      navigation={{
        chooseRepositoryForConversation,
        consumeNavigationIntent,
        createConversation,
        startChatInProject: async (projectId, sourceSessionId) => {
          try {
            await startChatInProject(projectId, sourceSessionId);
          } catch {
            pushToast({
              tone: "error",
              title: "Chat could not be opened",
              message: "The chat did not open. Your original draft was kept.",
            });
          }
        },
        openChatWithContext,
        openChatTerminal,
        openProjectManager,
        openSession,
        openWorkspaceFile,
        selectSession: setSelectedSession,
        setView,
        openComputerView: (next, origin) => {
          if (!origin) {
            pushToast({
              tone: "error",
              title: "Computer is unavailable",
              message: "Select a bot conversation before opening Computer.",
            });
            return;
          }
          const originScope = scopeForSession(origin.originConversationId);
          if (
            originScope.kind !== "confirmed" ||
            origin.workspacePath !== originScope.conversation.workspacePath
          ) {
            pushToast({
              tone: "error",
              title: "Computer is unavailable",
              message:
                "This chat has no confirmed workspace. Start a new chat in the intended project.",
            });
            return;
          }
          const projectId = originScope.conversation.projectId;
          void ensureComputerOriginOwnerBinding(origin, {
            savedSessionIds: new Set(
              sessions.map((session) => session.sessionId),
            ),
            localBotBindings,
            ...(projectId ? { projectId } : {}),
            bind: async (botId, sessionId, boundProjectId) => {
              const response =
                await desktopRequest<BotConversationScopeResponse>(
                  `/bots/${encodeURIComponent(botId)}/conversations`,
                  "POST",
                  {
                    sessionId,
                    ...(boundProjectId ? { projectId: boundProjectId } : {}),
                  },
                );
              if (
                response.conversation.workspacePath !== origin.workspacePath ||
                response.conversation.projectId !== boundProjectId
              )
                throw new Error("Conversation scope changed");
            },
          })
            .then(() => setView(next, { computerOrigin: origin }))
            .catch(() => {
              pushToast({
                tone: "error",
                title: "Computer is unavailable",
                message:
                  "This draft’s bot ownership could not be confirmed. The draft was kept.",
              });
            });
        },
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
      refreshRuntime={async () => {
        const refreshed = await refreshRuntime();
        await botResource.reload();
        return refreshed;
      }}
      routeFocus={routeFocus.current}
      runtime={runtime}
      runningTasks={runningTasks}
      scopedSessions={scopedSessions}
      sessionMetadata={sessions}
      selectedSession={selectedSession}
      selectedBotId={selectedBot?.id ?? ""}
      bots={bots}
      defaultBotId={defaultBotId}
      botIdForSession={botIdForSession}
      projectTargetForSession={projectTargetForSession}
      scopeForSession={scopeForSession}
      onConfirmConversationScope={recordConversationScope}
      onBindSessionBot={bindSessionBot}
      onCaptureSessionProject={captureSessionProject}
      onActivateBot={activateBot}
      view={routeView}
      workspacePath={workspace.currentPath}
      computerOrigin={computerOrigin}
    />
  );
  const chatRouteActive = renderedView === "chat" && !botCreationOpen;
  // Chat owns the renderer-side stream subscription and request state. Keep
  // that owner mounted while Settings, Code, or another route is visible so a
  // route transition cannot turn ordinary navigation into an interrupted run.
  const persistentChatView: View = chatRouteActive ? view : "chat";

  return (
    <WorkspaceShell
      hostSlots
      layout={canvasLayout ? "canvas" : "companion"}
      role="main"
      className={`${DESKTOP_SHELL_CLASS} platform-${window.doolittle.platform}${canvasLayout ? " layout-canvas" : ""}${
        effectiveNavCollapsed ? " nav-collapsed" : ""
      }`}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--utility-drawer-width": `${utilityDrawerWidth}px`,
          gridTemplateColumns: isMobileSidebarMode
            ? "minmax(0, 1fr)"
            : `${effectiveNavCollapsed ? "var(--sidebar-compact-width)" : "var(--sidebar-width)"} minmax(0, 1fr) ${
                utilityDocked
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
            navCollapsed={effectiveNavCollapsed}
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
      {newChatOpen ? (
        <NewChatChooser
          bots={bots}
          loading={botResource.status === "loading"}
          busy={newChatBusy}
          error={botResource.error}
          transitionError={newChatError}
          onChoose={(botId) => void chooseChatBot(botId)}
          onCreate={openCreateBot}
          onClose={() => {
            if (!newChatBusyRef.current) setNewChatOpen(false);
          }}
          onRetry={botResource.reload}
          projects={projectCards}
          scope={newChatScope}
          onScopeChange={setNewChatScope}
          returnFocusTarget={newChatTriggerRef.current}
        />
      ) : null}
      {editingBot ? (
        <BotCreationDialog
          key={editingBot.id}
          editingBot={editingBot}
          onClose={() => {
            setBotCreationOpen(false);
            setEditingBot(undefined);
          }}
          onCreated={() => {
            setEditingBot(undefined);
            void botResource.reload();
          }}
          returnFocusTarget={botCreationTriggerRef.current}
          runtime={runtime}
          workspacePath={workspace.currentPath}
          projectId={activeProject?.id}
        />
      ) : null}
      <Suspense
        fallback={
          <DesktopSidebarLoadingFallback
            isMobileSidebarMode={isMobileSidebarMode}
            mobileSidebarOpen={mobileSidebarOpen}
            platform={window.doolittle.platform}
            sidebarRef={sidebarRef}
          />
        }
      >
        <LazyDesktopSidebar
          isMobileSidebarMode={isMobileSidebarMode}
          mobileSidebarOpen={mobileSidebarOpen}
          navCollapsed={effectiveNavCollapsed}
          sidebarOpen={sidebarOpen}
          projectScope={projectScope}
          sidebarWidth={sidebarWidth}
          selectedBotId={selectedBot?.id ?? ""}
          defaultBotId={defaultBotId}
          bots={bots}
          botStatus={botResource.status ?? "loading"}
          botError={botResource.error}
          sessions={sessions}
          selectedSession={selectedSession}
          navigationView={navigationView}
          platform={window.doolittle.platform}
          sidebarRef={sidebarRef}
          onSidebarKeyDown={handleSidebarKeyDown}
          onClose={() => setMobileSidebarOpen(false)}
          onResize={resizeSidebar}
          onToggleNavigation={
            navigationAutoCollapsed ? closeUtilities : toggleNavigation
          }
          onOpenPalette={openCommandPalette}
          onStartConversation={startConversation}
          onOpenSession={openSession}
          onSelectBot={openBot}
          onAddBot={openCreateBot}
          onRetryBots={botResource.reload}
          onSetView={setView}
        />
      </Suspense>
      <section
        className={`${APP_MAIN_CLASS}${renderedView === "chat" ? " app-main--chat" : ""}`}
        ref={appMainRef}
      >
        <div
          className={`${WINDOW_DRAGBAR_CLASS}${
            renderedView === "chat" ? ` ${WINDOW_DRAGBAR_CHAT_CLASS}` : ""
          }`}
        >
          <div className={WINDOW_DRAGBAR_PRIMARY_CLASS}>
            <DesktopMobileMenuButton
              forceVisible={canvasLayout}
              onOpen={openSidebarForMobile}
            />
            <div
              className={`${WINDOW_CONTEXT_CLASS} flex min-w-0 items-center gap-2 [-webkit-app-region:no-drag]`}
            >
              {renderedView !== "chat" && navigationHistory.index > 0 ? (
                <button
                  aria-label={`Back to ${labelForView(navigationHistory.entries[navigationHistory.index - 1]) ?? "previous view"}`}
                  className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  onClick={() => traverseNavigationHistory(-1)}
                  type="button"
                >
                  <ArrowLeft aria-hidden size={16} />
                </button>
              ) : null}
              <div className="flex min-w-0 items-baseline gap-2">
                <strong className="shrink-0 truncate text-sm font-semibold text-[var(--text)]">
                  {renderedView === "chat"
                    ? botCreationOpen
                      ? "Create a new bot"
                      : (selectedBot?.name ?? "Doolittle")
                    : (activeItem?.label ?? "Doolittle")}
                </strong>
                {renderedView === "chat" && !botCreationOpen ? (
                  <span className="truncate text-sm text-[var(--muted)]">
                    {currentRouteLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <span aria-live="polite" className="sr-only">
              {`${currentRouteLabel} opened`}
            </span>
            {renderedView === "chat" && !botCreationOpen ? (
              <div
                aria-label="Conversation controls"
                className={CHAT_CHROME_HOST_CLASS}
                ref={setChatChromeHost}
                role="toolbar"
              />
            ) : null}
            {renderedView !== "chat" ? (
              <div className={WINDOW_TOOLS_CLASS}>
                <Suspense fallback={null}>
                  <DesktopWindowTools
                    onOpenSettings={() => setView("settings")}
                    backend={backend}
                    compactCommand={false}
                    onOpenPalette={openCommandPalette}
                    onRefresh={() => void refreshWithFeedback()}
                    onToggleUtilities={toggleUtilities}
                    platform={window.doolittle.platform}
                    utilityOpen={utilityOpen}
                  />
                </Suspense>
              </div>
            ) : null}
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
        {botCreationOpen ? (
          <div
            className={`${VIEW_CONTAINER_CLASS} ${VIEW_CONTAINER_WORKSPACE_CLASS}`}
            hidden={renderedView !== "chat"}
            inert={renderedView !== "chat"}
            aria-hidden={renderedView !== "chat"}
          >
            <BotCreationConversation
              onClose={() => {
                setBotCreationOpen(false);
                const trigger = botCreationTriggerRef.current;
                if (trigger?.isConnected)
                  requestAnimationFrame(() => trigger.focus());
              }}
              onCreated={onBotCreated}
              onDirtyChange={setBotCreationDirty}
              runtime={runtime}
            />
          </div>
        ) : null}
        <div
          aria-hidden={!chatRouteActive}
          className={`${VIEW_CONTAINER_CLASS} view-${persistentChatView} ${VIEW_CONTAINER_WORKSPACE_CLASS}`}
          data-view={chatRouteActive ? persistentChatView : undefined}
          data-view-owner="chat"
          hidden={!chatRouteActive}
          inert={!chatRouteActive}
        >
          <DesktopRouteErrorBoundary
            label="Chat"
            onReturnToChat={() => setView("chat")}
            onRetry={() => {
              resetDesktopRoute("chat");
              setRouteRetryNonce((current) => current + 1);
            }}
            resetKey={`chat\u0000${projectScope}\u0000${workspace.currentPath}\u0000${routeRetryNonce}`}
          >
            <Suspense
              fallback={<DesktopRouteLoadingFallback label="conversation" />}
            >
              {nativeSelectionRestored
                ? routeContent(persistentChatView)
                : null}
            </Suspense>
          </DesktopRouteErrorBoundary>
        </div>
        {renderedView !== "chat" ? (
          <div
            className={`${VIEW_CONTAINER_CLASS} view-${view}${
              ["code", "orchestration"].includes(renderedView)
                ? ` ${VIEW_CONTAINER_WORKSPACE_CLASS}`
                : ""
            }`}
            data-view={view}
            data-view-owner={renderedView}
            key={renderedView}
          >
            <DesktopRouteErrorBoundary
              label={activeItem?.label ?? "View"}
              onReturnToChat={() => setView("chat")}
              onRetry={() => {
                resetDesktopRoute(renderedView);
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
                {routeContent(view)}
              </Suspense>
            </DesktopRouteErrorBoundary>
          </div>
        ) : null}
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
                  workspacePath:
                    terminalOrigin?.workspacePath ?? workspace.currentPath,
                  origin: terminalOrigin,
                  projectScope,
                })
                  .then((accepted) => {
                    if (accepted) closeChatTerminal(false);
                  })
                  .catch(() => undefined);
              }}
              platform={window.doolittle.platform}
              workspacePath={
                terminalOrigin?.workspacePath ?? workspace.currentPath
              }
              origin={terminalOrigin}
              allowLegacy={terminalOrigin?.botId === defaultBotId}
            />
          </Suspense>
        ) : null}
      </section>
      {utilityOpen ? (
        <Suspense fallback={null}>
          <DesktopUtilityLayer
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
            onResize={resizeUtilityDrawer}
            utilityDrawerWidth={utilityDrawerWidth}
            utilityRef={utilityRef}
            mobileModal={utilityModalMode}
          />
        </Suspense>
      ) : null}
    </WorkspaceShell>
  );
}
