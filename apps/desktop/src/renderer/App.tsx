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
import { BotCreationDialog } from "./bots/BotCreationDialog";
import {
  latestBotSession,
  sessionBotId,
  visibleBots,
} from "./bots/bot-selection";
import {
  loadSessionBindings,
  loadSessionProjectBindings,
  saveSessionBindings,
  saveSessionProjectBindings,
  sessionProjectTarget,
} from "./bots/session-bindings";
import { DesktopRouteErrorBoundary } from "./components/DesktopRouteErrorBoundary";
import { useToasts } from "./components/ToastRegion";
import { useModalFocusBoundary } from "./components/useModalFocusBoundary";
import {
  type ComputerOrigin,
  ensureComputerOriginOwnerBinding,
} from "./computer-origin";
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
  announceAppearanceApplied,
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopTheme,
  applyThemeManifest,
  type DesktopAppearance,
  type DesktopDensity,
  loadAppearancePreference,
  loadDensityPreference,
  loadDesktopThemeSource,
  loadStoredThemeManifest,
  parseDesktopThemeProfile,
  resolveAppearance,
  subscribeToDesktopThemeChanges,
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
import { compactSessionPreview } from "./session-preview";
import {
  isCommandPaletteShortcut,
  shouldHandleGlobalChatTerminalShortcut,
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
  const [editingBot, setEditingBot] = useState<BotSummary | undefined>();
  const botCreationTriggerRef = useRef<HTMLElement | null>(null);
  const [appearance, setAppearance] = useState<DesktopAppearance>(
    loadAppearancePreference,
  );
  const [density, setDensity] = useState<DesktopDensity>(loadDensityPreference);
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedAppearance = resolveAppearance(appearance, systemPrefersDark);

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

  const closeChatTerminal = useCallback((restoreFocus = true) => {
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
    const bot = bots.find((entry) => entry.id === owner);
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
              bot && !bot.isDefault ? bot.workspacePath : workspace.currentPath,
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
    setTerminalOrigin(origin);
    if (utilityOpen && utilityModalMode) {
      setUtilityOpen(false);
    }
    chatTerminalReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMobileSidebarOpen(false);
    setChatTerminalMounted(true);
    setChatTerminalOpen(true);
  }, [
    setMobileSidebarOpen,
    utilityModalMode,
    utilityOpen,
    selectedSession,
    sessions,
    localBotBindings,
    defaultBotId,
    bots,
    computerOrigin,
    view,
    workspace.currentPath,
    pushToast,
  ]);

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
      const bot = bots.find((entry) => entry.id === owner);
      const origin = computer
        ? (suppliedOrigin ??
          (owner
            ? {
                botId: owner,
                originConversationId: selectedSession,
                workspacePath:
                  bot && !bot.isDefault
                    ? bot.workspacePath
                    : workspace.currentPath,
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
      bots,
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
    if (!selectedBot?.id) return;
    const id = newConversationId();
    setLocalBotBindings((current) => ({ ...current, [id]: selectedBot.id }));
    captureSessionProject(
      id,
      selectedBot.isDefault
        ? projectScope === "all" || projectScope === "unscoped"
          ? null
          : projectScope
        : (selectedBot.projectId ?? null),
    );
    setSelectedSession(id);
    setView("chat");
  }, [selectedBot, projectScope, captureSessionProject, setView]);

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
      const id = newConversationId();
      if (selectedBot?.id)
        setLocalBotBindings((current) => ({
          ...current,
          [id]: selectedBot.id,
        }));
      transitionToProjectScope(
        scope,
        id,
        projectNavigationTarget("new-conversation"),
      );
    },
    [selectedBot?.id, transitionToProjectScope],
  );

  const openBot = useCallback(
    (botId: string) => {
      if (!bots.some((bot) => bot.id === botId)) return;
      setSelectedBotId(botId);
      const latest = latestBotSession(sessions, botId, defaultBotId);
      if (latest) {
        void transitionToProjectScope(
          latest.projectId ?? "unscoped",
          latest.sessionId,
          "chat",
        );
      } else {
        const id = newConversationId();
        setLocalBotBindings((current) => ({ ...current, [id]: botId }));
        captureSessionProject(
          id,
          bots.find((bot) => bot.id === botId)?.projectId ?? null,
        );
        setSelectedSession(id);
        setView("chat");
      }
    },
    [
      bots,
      defaultBotId,
      sessions,
      setView,
      transitionToProjectScope,
      captureSessionProject,
    ],
  );

  const openCreateBot = useCallback(() => {
    botCreationTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setBotCreationOpen(true);
  }, []);

  const onBotCreated = useCallback(
    (bot: BotSummary) => {
      setBotCreationOpen(false);
      setPendingCreatedBot(bot);
      botResource.reload();
      setSelectedBotId(bot.id);
      const id = newConversationId();
      setLocalBotBindings((current) => ({ ...current, [id]: bot.id }));
      captureSessionProject(id, bot.projectId ?? null);
      setSelectedSession(id);
      setView("chat");
      pushToast({
        tone: "success",
        title: `${bot.name} saved`,
        message:
          bot.state === "ready"
            ? "The bot is ready for a conversation."
            : "This bot is stopped. Connect and activate it before sending.",
      });
    },
    [botResource.reload, pushToast, setView, captureSessionProject],
  );
  const activateBot = useCallback(
    async (botId: string) => {
      try {
        const activated = await desktopRequest<BotSummary>(
          `/bots/${encodeURIComponent(botId)}/activate`,
          "POST",
        );
        if (pendingCreatedBot?.id === botId) setPendingCreatedBot(activated);
        await botResource.reload();
        pushToast({
          tone: "success",
          title: `${activated.name} activated`,
          message: "Ready for a conversation.",
        });
      } catch (error) {
        pushToast({
          tone: "error",
          title: "Bot activation failed",
          message:
            error instanceof Error
              ? error.message
              : "Try again from this conversation.",
        });
      }
    },
    [botResource.reload, pendingCreatedBot?.id, pushToast],
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
  useEffect(() => {
    const owner = botIdForSession(selectedSession);
    if (owner && owner !== selectedBotId) setSelectedBotId(owner);
  }, [botIdForSession, selectedBotId, selectedSession]);

  useEffect(() => {
    applyDesktopAppearance(appearance, systemPrefersDark);
    announceAppearanceApplied(resolveAppearance(appearance, systemPrefersDark));
  }, [appearance, systemPrefersDark]);

  useEffect(() => {
    applyDesktopDensity(density);
  }, [density]);

  useEffect(() => {
    applyThemeManifest(
      loadStoredThemeManifest(),
      loadDesktopThemeSource() ?? "builtin",
    );
  }, []);

  useEffect(() => {
    if (backend.phase !== "ready") return;
    let disposed = false;
    void desktopRequest<ThemeResponse>("/theme")
      .then((response) => {
        if (disposed) return;
        if (["imported", "builtin"].includes(loadDesktopThemeSource() ?? ""))
          return;
        const profile = parseDesktopThemeProfile(response.profile);
        if (profile) applyDesktopTheme(profile, "runtime");
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

  const openInterfaceSettings = useEffectEvent(() => setView("settings"));
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
        .catch(() => undefined);
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

  useEffect(() => {
    if (document.documentElement.dataset.nativeInterfaceVisible === "false")
      return;
    const botId = botIdForSession(selectedSession);
    const bridge = window.doolittle.ui;
    if (!botId || !bridge) return;
    const projectId = sessions.find(
      (session) => session.sessionId === selectedSession,
    )?.projectId;
    void bridge
      .dispatch({
        type: "conversation.select",
        target: {
          botId,
          sessionId: selectedSession,
          ...(projectId ? { projectId } : {}),
        },
      })
      .catch(() => undefined);
  }, [botIdForSession, selectedSession, sessions]);

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
      void botResource.reload();
    },
    5_000,
    !!botCatalog,
  );

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
  const selectedSessionProjectId =
    sessions.find((session) => session.sessionId === selectedSession)
      ?.projectId ??
    activeProject?.id ??
    null;
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
          const originSession = sessions.find(
            (session) => session.sessionId === origin.originConversationId,
          );
          const projectId = originSession
            ? originSession.projectId
            : projectTargetForSession(origin.originConversationId)?.projectId;
          void ensureComputerOriginOwnerBinding(origin, {
            savedSessionIds: new Set(
              sessions.map((session) => session.sessionId),
            ),
            localBotBindings,
            ...(projectId ? { projectId } : {}),
            bind: async (botId, sessionId, boundProjectId) => {
              await desktopRequest(
                `/bots/${encodeURIComponent(botId)}/conversations`,
                "POST",
                {
                  sessionId,
                  ...(boundProjectId ? { projectId: boundProjectId } : {}),
                },
              );
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
      onBindSessionBot={bindSessionBot}
      onActivateBot={activateBot}
      view={routeView}
      workspacePath={workspace.currentPath}
      computerOrigin={computerOrigin}
    />
  );
  const chatRouteActive = renderedView === "chat";
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
      {botCreationOpen || editingBot ? (
        <BotCreationDialog
          key={editingBot?.id ?? "create"}
          editingBot={editingBot}
          onClose={() => {
            setBotCreationOpen(false);
            setEditingBot(undefined);
          }}
          onCreated={
            editingBot
              ? () => {
                  setEditingBot(undefined);
                  void botResource.reload();
                }
              : onBotCreated
          }
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
                    ? (selectedBot?.name ?? "Doolittle")
                    : (activeItem?.label ?? "Doolittle")}
                </strong>
                {renderedView === "chat" ? (
                  <span className="truncate text-sm text-[var(--muted)]">
                    {currentRouteLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <span aria-live="polite" className="sr-only">
              {`${currentRouteLabel} opened`}
            </span>
            {renderedView === "chat" ? (
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
              {routeContent(persistentChatView)}
            </Suspense>
          </DesktopRouteErrorBoundary>
        </div>
        {!chatRouteActive ? (
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
