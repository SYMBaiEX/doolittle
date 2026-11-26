import {
  ConversationFrame,
  useLiquidLayout,
  useSurfacePresence,
} from "@doolittle/ui";
import { useMediaQuery } from "@doolittle/ui/environment";
import { ArrowDown, LockKeyhole } from "lucide-react";
import {
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  BackendState,
  BotConversationScope,
  BotConversationScopeResponse,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
  SessionForkResponse,
  SessionSummary,
} from "../shared/contracts";
import { DesktopRouteLoadingFallback } from "./app-shell/DesktopRouteLoadingFallback";
import { BotRuntimeNotice } from "./bots/BotRuntimeNotice";
import type { KnowledgePromotionSource } from "./bots/KnowledgePromotionDialog";
import { ChatHeaderChrome } from "./chat/ChatHeaderChrome";
import { ChatNotice } from "./chat/ChatNotice";
import {
  CompanionInspector,
  type InspectorTab,
} from "./chat/CompanionInspector";
import { isChatNearBottom, scheduleChatScroll } from "./chat/chat-scroll";
import {
  chatComposerModule,
  chatTranscriptModule,
} from "./chat/chat-surface-modules";
import { addUnreadMessageIds, appendedMessageIds } from "./chat/chat-unread";
import {
  botAcceptsDispatch,
  chatDispatchBlockReason,
} from "./chat/dispatch-readiness";
import { snapshotDraftForDispatch } from "./chat/draft-dispatch-recovery";
import {
  INSPECTOR_SHEET_WIDTH,
  INSPECTOR_WIDTH,
  inspectorResizeBounds,
  loadInspectorWidth,
  observeInspectorGeometry,
  saveInspectorWidth,
} from "./chat/inspector-layout";
import "./chat/chat-surface.css";
import type { ChatWorkspaceTarget } from "./chat/ChatComposer";
import {
  type BranchMode,
  type DisplayMessage,
  isCommandMessage,
} from "./chat/models";
import { queueHeadStatus } from "./chat/queue-status";
import { queuedMessageRemovalTargets } from "./chat/queued-message-removal";
import { useChatAttachments } from "./chat/useChatAttachments";
import { useChatComposerSupport } from "./chat/useChatComposerSupport";
import { useChatMessageActions } from "./chat/useChatMessageActions";
import { useChatRunLifecycle } from "./chat/useChatRunLifecycle";
import type {
  ChatContextCapsule,
  ChatContextHandoff,
} from "./chat-context-handoff";
import { composeChatContextMessage } from "./chat-context-handoff";
import { visibleAssistantText } from "./components/message-output";
import { RouteControlDialog } from "./components/RouteControlDialog";
import { UiIcon } from "./components/UiIcon";
import { useModalFocusBoundary } from "./components/useModalFocusBoundary";
import { newConversationId } from "./conversation-id";
import {
  type AttachmentCleanupMap,
  composeQueuedMessage,
  loadConversationQueue,
  type PersistedQueuedMessage,
  queuedMessageWorkspaceStatus,
  saveConversationQueue,
} from "./conversation-persistence";
import { workspaceName } from "./desktop-navigation";
import { desktopRequest, errorMessage } from "./lib";
import {
  freezeMemoryMatchSnapshot,
  type MemoryMatchSnapshot,
} from "./memory-matches";
import { clampPanelSize } from "./panel-layout";
import type { ProjectLike, ProjectScope } from "./project-manager/models";
import type { SessionConversationScope } from "./session-conversation-scope";
import { queuedMessageMatchesConfirmedScope } from "./session-conversation-scope";
import {
  useWorkspaceRef,
  useWorkspaceState,
} from "./session-workspace/chat-workspace-store";
import type { ChatPanelViewState } from "./session-workspace/panel-view-state";
import { SessionWorkspace } from "./session-workspace/SessionWorkspace";
import { sessionWorkspaceBinding } from "./session-workspace/session-workspace-binding";
import type { ThreadWorkbenchFullView } from "./thread-workbench/models";
import { workspacePathsEqual } from "./workspace-path";

const NARROW_WORKBENCH_QUERY = "(max-width: 720px)";
const ATTACHMENT_ONLY_MESSAGE = "Review the attached files.";

export type ChatSurface = "conversation" | "history" | "media";

/** The transcript needs a useful user intent even when file context is the only input. */
function chatSubmissionContent(draft: string, attachmentCount: number): string {
  const trimmed = draft.trim();
  return trimmed || attachmentCount > 0
    ? trimmed || ATTACHMENT_ONLY_MESSAGE
    : "";
}

const ChatComposer = chatComposerModule.Component;
const KnowledgePromotionDialog = lazy(async () => ({
  default: (await import("./bots/KnowledgePromotionDialog"))
    .KnowledgePromotionDialog,
}));
const ChatTranscript = chatTranscriptModule.Component;
const MediaPage = lazy(async () => {
  const module = await import("./MediaPage");
  return { default: module.MediaPage };
});
const SessionsPage = lazy(async () => {
  const module = await import("./sessions/SessionsPage");
  return { default: module.SessionsPage };
});
export function ChatPage(props: ChatPageProps) {
  return (
    <SessionWorkspace
      {...props}
      renderPanel={(panelProps) => <ChatSessionPanel {...panelProps} />}
    />
  );
}

export interface ChatPageProps {
  bots?: readonly import("@doolittle/contracts/bots").BotSummary[];
  selectedBotId?: string;
  defaultBotId?: string;
  botIdForSession?: (sessionId: string) => string;
  projectTargetForSession?: (
    sessionId: string,
  ) => { projectId?: string } | undefined;
  scopeForSession?: (sessionId: string) => SessionConversationScope;
  onConfirmConversationScope?: (scope: BotConversationScope) => void;
  onSessionSummary?: (summary: SessionSummary) => void;
  onBindSessionBot?: (sessionId: string, botId: string) => void;
  onCaptureSessionProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  onActivateBot?: (botId: string) => Promise<void>;
  routeActive?: boolean;
  backend: BackendState;
  runtime: RuntimeStatus | null;
  remoteSessions: SessionSummary[];
  sessionMetadata?: readonly SessionSummary[];
  selectedId: string;
  workspacePath: string;
  /** Shared host workspace identity before per-bot panel workspace overrides. */
  inventoryWorkspacePath?: string;
  onSelect: (sessionId: string, restoreFocus?: boolean) => void;
  refreshRuntime: () => void;
  onOpenModelsPage: () => void;
  onOpenProvidersPage: () => void;
  onOpenSettings?: () => void;
  onOpenWorkspaceView: (
    view: ThreadWorkbenchFullView,
    origin?: import("./computer-origin").ComputerOrigin,
  ) => void;
  onConsumeContextHandoff: (id: string) => void;
  activeProject?: {
    id: string;
    name: string;
    color?: string | null;
    primaryPath?: string | null;
  } | null;
  projects?: readonly ProjectLike[];
  onChooseRepository?: (sessionId?: string) => void | Promise<void>;
  onOpenProjectManager?: () => void;
  onConfirmProjectAccess?: (sessionId: string) => void;
  onSelectProjectForNewChat?: (
    scope: ProjectScope,
    sourceSessionId?: string,
  ) => void;
  onRequestNewConversation?: () => void;
  onActivateSessionProject?: (sessionId: string, projectId: string) => void;
  pendingApprovals: number;
  pendingContextHandoff: ChatContextHandoff | null;
  runningTasks: number;
  chromeHost: HTMLElement | null;
  surface?: ChatSurface;
  onSurfaceChange?: (surface: ChatSurface) => void;
}

export function ChatSessionPanel({
  bots,
  selectedBotId = "",
  defaultBotId = "",
  botIdForSession,
  projectTargetForSession,
  scopeForSession,
  onConfirmConversationScope,
  onSessionSummary,
  onBindSessionBot,
  onCaptureSessionProject,
  onActivateBot,
  routeActive = true,
  backend: hostBackend,
  runtime,
  remoteSessions,
  sessionMetadata = remoteSessions,
  selectedId,
  workspacePath: hostWorkspacePath,
  inventoryWorkspacePath,
  onSelect,
  refreshRuntime,
  onOpenModelsPage,
  onOpenProvidersPage,
  onOpenSettings,
  onOpenWorkspaceView,
  onConsumeContextHandoff,
  activeProject,
  projects,
  onChooseRepository,
  onOpenProjectManager,
  onConfirmProjectAccess,
  onSelectProjectForNewChat,
  onRequestNewConversation,
  onActivateSessionProject,
  pendingContextHandoff,
  runningTasks,
  chromeHost,
  surface = "conversation",
  onSurfaceChange,
  coordinator = false,
  focused = true,
  visible = true,
}: ChatPageProps & {
  coordinator?: boolean;
  focused?: boolean;
  visible?: boolean;
}) {
  const resolveSessionBot = (sessionId: string) =>
    botIdForSession
      ? botIdForSession(sessionId)
      : defaultBotId || selectedBotId || "";
  const currentBotId = resolveSessionBot(selectedId);
  const isReadOnlySession = (sessionId: string) =>
    sessionMetadata.some(
      (session) =>
        session.sessionId === sessionId &&
        (session.readOnly || session.conversationKind === "group"),
    );
  const readOnlyChat = isReadOnlySession(selectedId);
  const currentBot = bots?.find((bot) => bot.id === currentBotId);
  const backend =
    currentBot && !currentBot.isDefault
      ? {
          ...hostBackend,
          phase: (["ready", "busy", "waiting"].includes(currentBot.state)
            ? "ready"
            : currentBot.state === "starting"
              ? "booting"
              : currentBot.state === "error"
                ? "degraded"
                : "stopped") as BackendState["phase"],
          message:
            currentBot.error ?? `${currentBot.name} is ${currentBot.state}`,
        }
      : hostBackend;
  const workspacePath = hostWorkspacePath;
  const openComputerView = (view: ThreadWorkbenchFullView) =>
    onOpenWorkspaceView(
      view,
      currentBotId
        ? {
            botId: currentBotId,
            originConversationId: selectedId,
            workspacePath,
          }
        : undefined,
    );
  const [queuedMessages, setQueuedMessages] = useWorkspaceState<
    PersistedQueuedMessage[]
  >("run.queue", () => loadConversationQueue(localStorage));
  const [queuePaused, setQueuePaused] = useWorkspaceState(
    "run.queue-paused",
    () => queuedMessages.length > 0,
  );
  const [queueAnnouncement, setQueueAnnouncement] = useWorkspaceState(
    "run.queue-announcement",
    () =>
      queuedMessages.length > 0
        ? `${queuedMessages.length} queued ${queuedMessages.length === 1 ? "message was" : "messages were"} recovered. Review and resume when ready.`
        : "",
  );
  const {
    activeRequest,
    activeRequests,
    setActiveRequests,
    dispatchPending,
    setDispatchPending,
    dispatchFeedback,
    setDispatchFeedback,
    runClaims,
    runHydration,
    runHydrationForBot,
    visibleRunHydrationWarnings,
    retryRunHydration,
    conversation,
    progress,
    publishProgress,
    runReceipts,
    runConnection,
    cancellingRequest,
    settleRequest,
    reconnectRequest,
    cancelRequest,
  } = useChatRunLifecycle({
    coordinator,
    paneReady: backend.phase === "ready" && !coordinator && visible,
    nativeHostReady: backend.phase === "ready",
    selectedId,
    hostBackend,
    inventoryIdentityPath: inventoryWorkspacePath ?? hostWorkspacePath,
    bots,
    currentBotId,
    defaultBotId,
    botIdForSession,
    remoteSessions,
    sessionMetadata,
    onSelect,
    onBindSessionBot,
    onSessionSummary,
    refreshRuntime,
    setQueueAnnouncement,
  });
  const {
    draft,
    draftAttachments,
    draftAttachmentCleanup,
    chatContextCapsule,
    clearDraftForDispatch,
    getDraftRevision,
    hasEarlierMessages,
    historyError,
    loadEarlierHistory,
    loadingEarlierHistory,
    loadingHistory,
    selectedMessages,
    selectedSession,
    storageWarning,
    sessions,
    setDraft,
    setDraftAttachments,
    setChatContextCapsule,
    setDraftForSession,
    setMessages,
    retryHistory,
    restoreDraftAfterRejectedDispatch,
    togglePin,
  } = conversation;
  const latestSelectedMessage = selectedMessages.at(-1);
  const workspaceBinding = sessionWorkspaceBinding(
    selectedSession,
    projects,
    workspacePath,
    window.doolittle.platform,
  );
  const foreignProject =
    !scopeForSession && workspaceBinding.kind === "foreign"
      ? workspaceBinding.project
      : undefined;
  const selectedScope = scopeForSession?.(selectedId);
  const confirmedWorkspace =
    selectedScope?.kind === "confirmed"
      ? selectedScope.conversation
      : undefined;
  const pendingProject =
    selectedScope?.kind === "pending" && selectedScope.projectId
      ? projects?.find(
          (project) =>
            project.id === selectedScope.projectId && !project.archived,
        )
      : undefined;
  const workspaceTarget: ChatWorkspaceTarget = confirmedWorkspace?.projectId
    ? {
        kind: "local",
        projectId: confirmedWorkspace.projectId,
        name:
          confirmedWorkspace.projectContext?.name ??
          workspaceName(confirmedWorkspace.workspacePath),
        path: confirmedWorkspace.workspacePath,
      }
    : pendingProject
      ? { kind: "pending", name: pendingProject.name }
      : confirmedWorkspace ||
          (selectedScope?.kind === "pending" && !selectedScope.projectId)
        ? { kind: "private" }
        : { kind: "unconfirmed" };
  const workspaceBindingBlocked = selectedScope
    ? selectedScope.kind === "unknown" ||
      (selectedScope.kind === "pending" && Boolean(selectedScope.projectId))
    : workspaceBinding.kind === "foreign" ||
      workspaceBinding.kind === "unknown";
  const botReady = currentBot
    ? ["ready", "busy", "waiting"].includes(currentBot.state)
    : !currentBotId || currentBotId === defaultBotId;
  const botCanDispatch = botAcceptsDispatch(
    currentBot,
    currentBotId,
    defaultBotId,
  );
  const [visitedHistory, setVisitedHistory] = useState(surface === "history");
  const [visitedMedia, setVisitedMedia] = useState(surface === "media");
  useEffect(() => {
    if (surface === "history") setVisitedHistory(true);
    if (surface === "media") setVisitedMedia(true);
  }, [surface]);
  const canDraft =
    !readOnlyChat &&
    (backend.phase === "ready" ||
      hostBackend.phase === "ready" ||
      hostBackend.phase === "booting");
  const panelViewSnapshots = useWorkspaceRef<
    Record<string, ChatPanelViewState>
  >("view.snapshots", {});
  if (!coordinator && !panelViewSnapshots.current[selectedId]) {
    panelViewSnapshots.current[selectedId] = {
      scrollTop: 0,
      follow: true,
      inspectorVisible: false,
      unreadMessageIds: [],
      knownMessageIds: [],
    };
  }
  const savedView = coordinator
    ? undefined
    : panelViewSnapshots.current[selectedId];
  const [inspectorVisible, setInspectorVisible] = useState(
    () => savedView?.inspectorVisible ?? false,
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(
    () => savedView?.inspectorTab ?? "details",
  );
  const [preferredInspectorWidth, setPreferredInspectorWidth] =
    useWorkspaceState<number | null>("layout.inspector-width", () =>
      loadInspectorWidth(localStorage),
    );
  useEffect(() => {
    if (coordinator || !window.doolittle.ui) return;
    let disposed = false;
    const applySurface = (request: {
      target: { botId: string; sessionId: string };
      surface: "details" | "library" | "computer";
    }) => {
      if (
        disposed ||
        request.target.sessionId !== selectedId ||
        request.target.botId !== currentBotId
      )
        return;
      setInspectorTab(
        request.surface === "library"
          ? "files"
          : request.surface === "computer"
            ? "terminal"
            : "details",
      );
      setInspectorVisible(true);
    };
    const detach = window.doolittle.ui.onSurface(applySurface);
    void window.doolittle.ui
      .getState("presentation")
      .then((state) => {
        if (state.hostSurface) applySurface(state.hostSurface);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      detach();
    };
  }, [coordinator, currentBotId, selectedId]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [narrowPanel, setNarrowPanel] = useState(false);
  const [inspectorGeometry, setInspectorGeometry] = useState({
    paneWidth: 0,
    themeWidth: INSPECTOR_WIDTH.default as number,
  });
  useEffect(() => {
    const panel = workspaceRef.current;
    if (!panel) return;
    return observeInspectorGeometry(panel, (geometry) => {
      setNarrowPanel(
        geometry.paneWidth > 0 && geometry.paneWidth <= INSPECTOR_SHEET_WIDTH,
      );
      setInspectorGeometry((current) =>
        current.paneWidth === geometry.paneWidth &&
        current.themeWidth === geometry.themeWidth
          ? current
          : geometry,
      );
    });
  }, []);
  const isNarrowViewport = useMediaQuery(NARROW_WORKBENCH_QUERY);
  const isNarrowWorkbench = isNarrowViewport || narrowPanel;
  const approvalsVisible =
    routeActive &&
    visible &&
    surface === "conversation" &&
    !(inspectorVisible && isNarrowWorkbench);
  const inspectorBounds = inspectorResizeBounds(
    inspectorGeometry.paneWidth,
    inspectorGeometry.themeWidth,
  );
  const inspectorWidth = clampPanelSize(
    preferredInspectorWidth ?? inspectorBounds.default,
    inspectorBounds,
  );
  const resizeInspector = (width: number) => {
    const preference = width === inspectorBounds.default ? null : width;
    setPreferredInspectorWidth(preference);
    saveInspectorWidth(localStorage, preference);
  };
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const attachedFiles = draftAttachments;
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [promotionFeedback, setPromotionFeedback] = useWorkspaceState<
    Record<string, { busy: boolean; error?: string; message: string }>
  >("knowledge.promotion-feedback", {});
  const [promotionSource, setPromotionSource] =
    useState<KnowledgePromotionSource>();
  const promoteMessage = (message: DisplayMessage) => {
    if (!currentBotId) return;
    setPromotionSource({
      botId: currentBotId,
      sessionId: selectedId,
      projectId: sessions.find((session) => session.sessionId === selectedId)
        ?.projectId,
      message: { ...message },
      returnFocusTarget: document.activeElement as HTMLElement | null,
    });
  };
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const {
    attachmentValidationError,
    attachmentImportPending,
    setAttachmentValidationError,
    cleanupManagedAttachments,
    pickContextFiles,
    importAndTranscribeRecording,
    removeContextFile,
  } = useChatAttachments({
    selectedId,
    currentBotId,
    coordinator,
    attachedFiles,
    draftAttachmentCleanup,
    setDraftAttachments,
  });
  const [unreadMessageIdsBySession, setUnreadMessageIdsBySession] = useState<
    Record<string, string[]>
  >(() => (savedView ? { [selectedId]: savedView.unreadMessageIds } : {}));
  const [commandSelection, setCommandSelection] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const transcriptFollowRef = useRef(savedView?.follow ?? true);
  const forceTranscriptFollowRef = useRef(false);
  const scheduledForceTranscriptFollowRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  // A dialog can settle between this render and the selected-session effect.
  selectedIdRef.current = selectedId;
  const knownMessageIdsBySession = useRef<Record<string, string[]>>(
    savedView ? { [selectedId]: savedView.knownMessageIds } : {},
  );
  const scheduleTranscriptScrollRef = useRef<(() => void) | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerPresentationActiveRef = useRef(false);
  composerPresentationActiveRef.current =
    !coordinator &&
    focused &&
    visible &&
    routeActive &&
    surface === "conversation" &&
    !(inspectorVisible && isNarrowWorkbench);
  const workbenchToggleRef = useRef<HTMLButtonElement>(null);
  const closeInspector = useCallback(() => {
    setInspectorVisible(false);
    requestAnimationFrame(() =>
      workbenchToggleRef.current?.focus({ preventScroll: true }),
    );
  }, []);
  const workbenchDialogRef = useModalFocusBoundary({
    active:
      inspectorVisible &&
      isNarrowViewport &&
      visible &&
      focused &&
      !coordinator,
    initialFocusSelector: '[aria-label="Close inspector"]',
    isolateBackground: true,
    onClose: closeInspector,
    restoreFocus: !inspectorVisible,
    restoreFocusRef: workbenchToggleRef,
  });
  const queueRef = useRef<HTMLDivElement>(null);
  const queueDispatchRef = useWorkspaceRef<string | null>(
    "run.queue-dispatch",
    null,
  );
  const consumedContextHandoffs = useRef(new Set<string>());

  const {
    commandCatalog,
    commandSuggestions,
    memoryMatches,
    refreshSessionUsage,
    selectCommandSuggestion,
    selectedContext,
    selectedContextLabel,
    selectedContextPercent,
    selectedContextTone,
    selectedUsageError,
    usageLoading,
  } = useChatComposerSupport({
    backendReady: backend.phase === "ready" && !coordinator && visible,
    commandMenuDismissed,
    composerRef,
    draft,
    selectedId,
    botId: currentBotId,
    botIdForSession,
    setCommandMenuDismissed,
    setDraft,
    setQueueAnnouncement,
    workspacePath,
  });
  const previousActiveRequest = useRef(activeRequest);
  useEffect(() => {
    if (
      previousActiveRequest.current &&
      !activeRequest &&
      !coordinator &&
      visible
    ) {
      void refreshSessionUsage(selectedId);
    }
    previousActiveRequest.current = activeRequest;
  }, [activeRequest, coordinator, refreshSessionUsage, selectedId, visible]);
  const {
    copyMessage,
    copyStates,
    readMessage,
    speakingMessageId,
    speechSupported,
    stopSpeaking,
  } = useChatMessageActions();

  const insertChatContext = useCallback(
    (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;
      setDraft((current) =>
        current.trim() ? `${current}\n\n${normalized}` : normalized,
      );
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [setDraft],
  );

  useLayoutEffect(() => {
    if (coordinator || !visible) return;
    const container = endRef.current?.parentElement;
    if (!container) return;
    const saved = panelViewSnapshots.current[selectedId];
    if (saved) {
      container.scrollTop = saved.scrollTop;
      transcriptFollowRef.current = saved.follow;
    } else {
      transcriptFollowRef.current = isChatNearBottom(container);
    }
    const handleScroll = () => {
      transcriptFollowRef.current = isChatNearBottom(container);
      const snapshot = panelViewSnapshots.current[selectedId];
      if (snapshot) {
        snapshot.scrollTop = container.scrollTop;
        snapshot.follow = transcriptFollowRef.current;
      }
      if (transcriptFollowRef.current) {
        const sessionId = selectedIdRef.current;
        setUnreadMessageIdsBySession((current) =>
          current[sessionId]?.length
            ? { ...current, [sessionId]: [] }
            : current,
        );
      }
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [coordinator, panelViewSnapshots, selectedId, visible]);

  useEffect(() => {
    const currentIds = selectedMessages.map((message) => message.id);
    const previousIds = knownMessageIdsBySession.current[selectedId];
    knownMessageIdsBySession.current[selectedId] = currentIds;
    if (!previousIds || loadingHistory === selectedId) return;

    if (forceTranscriptFollowRef.current || transcriptFollowRef.current) {
      setUnreadMessageIdsBySession((current) =>
        current[selectedId]?.length
          ? { ...current, [selectedId]: [] }
          : current,
      );
      return;
    }

    const appendedIds = appendedMessageIds(previousIds, currentIds);
    if (appendedIds.length === 0) return;
    setUnreadMessageIdsBySession((current) =>
      addUnreadMessageIds(current, selectedId, appendedIds),
    );
  }, [loadingHistory, selectedId, selectedMessages]);

  useEffect(() => {
    if (coordinator) return;
    const saved = panelViewSnapshots.current[selectedId];
    if (!saved) return;
    saved.inspectorVisible = inspectorVisible;
    saved.inspectorTab = inspectorTab;
    saved.unreadMessageIds = unreadMessageIdsBySession[selectedId] ?? [];
    saved.knownMessageIds = selectedMessages.map((message) => message.id);
  }, [
    coordinator,
    inspectorVisible,
    inspectorTab,
    panelViewSnapshots,
    selectedId,
    selectedMessages,
    unreadMessageIdsBySession,
  ]);

  useEffect(() => {
    if (!latestSelectedMessage) return;
    if (forceTranscriptFollowRef.current) {
      scheduledForceTranscriptFollowRef.current = true;
    }
    const shouldFollow =
      scheduledForceTranscriptFollowRef.current || transcriptFollowRef.current;
    forceTranscriptFollowRef.current = false;
    if (!shouldFollow) return;
    const end = endRef.current;
    if (!end) return;
    if (!scheduleTranscriptScrollRef.current) {
      scheduleTranscriptScrollRef.current = scheduleChatScroll(
        (callback) => requestAnimationFrame(callback),
        () => {
          const forceFollow = scheduledForceTranscriptFollowRef.current;
          scheduledForceTranscriptFollowRef.current = false;
          if (!transcriptFollowRef.current && !forceFollow) return;
          endRef.current?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
          });
        },
      );
    }
    scheduleTranscriptScrollRef.current();
  }, [latestSelectedMessage, prefersReducedMotion]);

  useEffect(() => {
    if (coordinator) saveConversationQueue(localStorage, queuedMessages);
  }, [coordinator, queuedMessages]);

  useEffect(() => {
    if (!coordinator || !queueAnnouncement) return;
    const timeout = window.setTimeout(() => setQueueAnnouncement(""), 2_500);
    return () => window.clearTimeout(timeout);
  }, [coordinator, queueAnnouncement, setQueueAnnouncement]);

  useEffect(() => {
    if (coordinator || !focused) return;
    const handleToggleInspector = () => {
      setInspectorVisible((current) => !current);
    };
    window.addEventListener(
      "doolittle:toggle-inspector",
      handleToggleInspector,
    );
    return () =>
      window.removeEventListener(
        "doolittle:toggle-inspector",
        handleToggleInspector,
      );
  }, [coordinator, focused]);

  useEffect(() => {
    if (
      coordinator ||
      !pendingContextHandoff ||
      pendingContextHandoff.sessionId !== selectedId
    ) {
      return;
    }
    if (consumedContextHandoffs.current.has(pendingContextHandoff.id)) {
      onConsumeContextHandoff(pendingContextHandoff.id);
      return;
    }
    consumedContextHandoffs.current.add(pendingContextHandoff.id);
    insertChatContext(pendingContextHandoff.prompt);
    setChatContextCapsule(pendingContextHandoff.capsule);
    onConsumeContextHandoff(pendingContextHandoff.id);
  }, [
    insertChatContext,
    coordinator,
    onConsumeContextHandoff,
    pendingContextHandoff,
    selectedId,
    setChatContextCapsule,
  ]);

  const selectedMessageCount =
    selectedSession?.messageCount ?? selectedMessages.length;
  const latestAssistant = [...selectedMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const accessibilityStatus =
    loadingHistory === selectedId
      ? "Loading conversation."
      : queueAnnouncement ||
        (runConnection
          ? ""
          : progress ||
            (latestAssistant && !latestAssistant.pending
              ? `${currentBot?.name ?? "Doolittle"} ${latestAssistant.error ? "response failed." : "replied."}`
              : ""));

  const sendMessage = async ({
    input,
    attachments,
    attachmentCleanup = {},
    sessionId,
    clearComposer = false,
    memoryMatchOverride,
    projectIdOverride,
    contextCapsule = null,
    composedContentOverride,
  }: {
    input: string;
    attachments: ManagedAttachmentDescriptor[];
    attachmentCleanup?: AttachmentCleanupMap;
    sessionId: string;
    clearComposer?: boolean;
    memoryMatchOverride?: MemoryMatchSnapshot;
    projectIdOverride?: string | null;
    contextCapsule?: ChatContextCapsule | null;
    composedContentOverride?: string;
  }) => {
    if (isReadOnlySession(sessionId)) return false;
    if (clearComposer && attachmentImportPending) {
      setAttachmentValidationError(
        "Wait for file import to finish before sending this message.",
      );
      return false;
    }
    const visibleContent = chatSubmissionContent(input, attachments.length);
    const content =
      composedContentOverride ??
      composeChatContextMessage(visibleContent, contextCapsule);
    const botId = resolveSessionBot(sessionId);
    const owner = bots?.find((bot) => bot.id === botId);
    const targetScope = scopeForSession?.(sessionId);
    if (
      targetScope?.kind === "unknown" ||
      (targetScope?.kind === "pending" && targetScope.projectId)
    ) {
      setDispatchFeedback((current) => ({
        ...current,
        [sessionId]:
          targetScope.kind === "unknown"
            ? "This chat has no confirmed workspace. Its history and draft are retained; start a new chat to work in a project."
            : "Choose this project from New chat to confirm access before sending. Your draft is retained.",
      }));
      return false;
    }
    const blockedReason = chatDispatchBlockReason({
      hasContent: Boolean(content),
      sessionId,
      workspaceKind: targetScope?.kind === "confirmed" ? "current" : "unbound",
      alreadyClaimed: Boolean(runClaims.current.forSession(sessionId)),
      ownerResolved: !botIdForSession || Boolean(botId),
      ownerReady: botAcceptsDispatch(owner, botId, defaultBotId),
      backendReady: hostBackend.phase === "ready",
      hydration: runHydrationForBot(botId),
    });
    if (blockedReason) {
      setDispatchFeedback((current) => ({
        ...current,
        [sessionId]: blockedReason,
      }));
      return false;
    }
    setDispatchFeedback((current) => ({ ...current, [sessionId]: "" }));

    if (isCommandMessage(content) && attachments.length > 0) {
      setQueueAnnouncement(
        "Remove message attachments before running a command.",
      );
      return false;
    }
    const messageAttachments = attachments;
    const projectTarget = projectTargetForSession?.(sessionId);
    if (projectTargetForSession && !projectTarget) {
      setDispatchFeedback((current) => ({
        ...current,
        [sessionId]:
          "This draft's workspace ownership is unavailable. Start a conversation in the intended workspace; your draft has been kept.",
      }));
      return false;
    }
    const memoryMatch =
      memoryMatchOverride ??
      (clearComposer
        ? freezeMemoryMatchSnapshot(content, memoryMatches)
        : undefined);
    const requestProjectId =
      targetScope?.kind === "confirmed"
        ? targetScope.conversation.projectId
        : projectIdOverride === undefined
          ? projectTargetForSession
            ? projectTarget?.projectId
            : (remoteSessions.find((session) => session.sessionId === sessionId)
                ?.projectId ?? activeProject?.id)
          : (projectIdOverride ?? undefined);
    const requestId = crypto.randomUUID();
    let dispatchWorkspacePath =
      targetScope?.kind === "confirmed"
        ? targetScope.conversation.workspacePath
        : "";
    const dispatchedDraftRevision = getDraftRevision(sessionId);
    const claim = runClaims.current.reserve(requestId, sessionId, botId);
    if (!claim) return false;
    if (botId) {
      setDispatchPending((current) => ({ ...current, [sessionId]: true }));
      try {
        const response = await desktopRequest<BotConversationScopeResponse>(
          `/bots/${encodeURIComponent(botId)}/conversations`,
          "POST",
          { sessionId },
        );
        const confirmed = response?.conversation;
        if (
          scopeForSession &&
          (!confirmed ||
            confirmed.sessionId !== sessionId ||
            confirmed.botId !== botId ||
            confirmed.projectId !== requestProjectId ||
            !confirmed.workspacePath ||
            (dispatchWorkspacePath &&
              !workspacePathsEqual(
                confirmed.workspacePath,
                dispatchWorkspacePath,
                window.doolittle.platform,
              )))
        )
          throw new Error("Conversation scope mismatch");
        if (confirmed) {
          dispatchWorkspacePath = confirmed.workspacePath;
          onConfirmConversationScope?.(confirmed);
        } else if (!scopeForSession) dispatchWorkspacePath = workspacePath;
      } catch {
        runClaims.current.release(claim);
        setDispatchFeedback((current) => ({
          ...current,
          [sessionId]:
            "Conversation ownership could not be confirmed. Your draft has been kept.",
        }));
        return false;
      } finally {
        setDispatchPending((current) => ({ ...current, [sessionId]: false }));
      }
    }
    if (!runClaims.current.activate(claim)) {
      runClaims.current.release(claim);
      setDispatchFeedback((current) => ({
        ...current,
        [sessionId]:
          "A running response was recovered. Your draft has been kept.",
      }));
      return false;
    }
    if (botId) onBindSessionBot?.(sessionId, botId);
    const createdAt = new Date().toISOString();
    const dispatchedDraft =
      clearComposer && getDraftRevision(sessionId) === dispatchedDraftRevision
        ? {
            text: input,
            attachments: messageAttachments,
            attachmentCleanup,
            capsule: contextCapsule,
          }
        : null;
    // A user's own dispatch should remain visible even if they were reading history.
    if (!coordinator && sessionId === selectedId)
      forceTranscriptFollowRef.current = true;
    setMessages((current) => ({
      ...current,
      [sessionId]: [
        ...(current[sessionId] ?? []),
        {
          id: crypto.randomUUID(),
          runId: requestId,
          role: "user",
          content: visibleContent,
          attachments: messageAttachments,
          createdAt,
          memoryMatch,
          ...(contextCapsule
            ? {
                contextCapsule: {
                  kind: contextCapsule.kind,
                  path: contextCapsule.path,
                  ...(contextCapsule.source
                    ? { source: contextCapsule.source }
                    : {}),
                },
              }
            : {}),
        },
        {
          id: `assistant:${requestId}`,
          runId: requestId,
          role: "assistant",
          content: "",
          createdAt,
          pending: true,
        },
      ],
    }));
    const dispatchRecovery = dispatchedDraft
      ? snapshotDraftForDispatch(
          sessionId,
          dispatchedDraft,
          clearDraftForDispatch(sessionId),
        )
      : null;
    publishProgress(
      sessionId,
      `${owner?.name ?? "Doolittle"} is considering the request…`,
    );
    setActiveRequests((current) => ({ ...current, [sessionId]: requestId }));
    try {
      await window.doolittle.startChat({
        requestId,
        message: content,
        roomId: sessionId,
        ...(botId ? { botId } : {}),
        workspacePath: dispatchWorkspacePath,
        attachmentIds: messageAttachments.map((attachment) => attachment.id),
        ...(Object.keys(attachmentCleanup).length > 0
          ? { attachmentCleanup }
          : {}),
        ...(requestProjectId ? { projectId: requestProjectId } : {}),
      } as Parameters<typeof window.doolittle.startChat>[0]);
      return true;
    } catch (error) {
      if (runClaims.current.get(requestId) !== claim) return false;
      settleRequest(
        claim,
        "error",
        (message) => ({ ...message, content: errorMessage(error) }),
        false,
      );
      if (dispatchRecovery) {
        const restored = restoreDraftAfterRejectedDispatch(dispatchRecovery);
        if (!restored && Object.keys(attachmentCleanup).length > 0) {
          void cleanupManagedAttachments(
            messageAttachments.map((attachment) => attachment.id),
            attachmentCleanup,
            botId,
          ).catch(() => undefined);
        }
      }
      return false;
    }
  };

  async function branchMessage(
    message: DisplayMessage,
    mode: BranchMode,
  ): Promise<void> {
    if (
      backend.phase !== "ready" ||
      activeRequest ||
      forkingMessageId ||
      message.pending ||
      (message.error && mode !== "retry")
    ) {
      return;
    }

    const messageIndex = selectedMessages.findIndex(
      (entry) => entry.id === message.id,
    );
    if (messageIndex < 0) return;

    const retryPrompt =
      mode === "retry"
        ? [...selectedMessages.slice(0, messageIndex)]
            .reverse()
            .find((entry) => entry.role === "user")
        : undefined;
    if (mode === "retry" && !retryPrompt) {
      setQueueAnnouncement("No user prompt is available to retry.");
      return;
    }

    setForkingMessageId(message.id);
    try {
      const boundaryMessage = mode === "retry" ? retryPrompt : message;
      const sourceBotId = resolveSessionBot(selectedId);
      if (botIdForSession && !sourceBotId)
        throw new Error("Conversation owner is unavailable.");
      const response = await desktopRequest<SessionForkResponse>(
        "/sessions/fork",
        "POST",
        mode === "fork"
          ? {
              sourceSessionId: selectedId,
              throughMessageId: boundaryMessage?.id,
            }
          : {
              sourceSessionId: selectedId,
              beforeMessageId: boundaryMessage?.id,
            },
        undefined,
        undefined,
        sourceBotId,
      );
      const fork = response.fork;
      if (sourceBotId) onBindSessionBot?.(fork.sessionId, sourceBotId);
      onCaptureSessionProject?.(fork.sessionId, fork.projectId ?? null);
      if (sourceBotId && fork.summary.workspacePath) {
        onConfirmConversationScope?.({
          sessionId: fork.sessionId,
          botId: sourceBotId,
          ...(fork.summary.projectId
            ? { projectId: fork.summary.projectId }
            : {}),
          workspacePath: fork.summary.workspacePath,
          ...(fork.summary.projectContext
            ? { projectContext: fork.summary.projectContext }
            : {}),
          createdAt: fork.summary.startedAt ?? "",
          updatedAt: fork.summary.endedAt ?? fork.summary.startedAt ?? "",
        });
      }

      if (mode === "edit") {
        setDraftForSession(
          fork.sessionId,
          message.content,
          message.attachments ?? [],
        );
      }

      await Promise.resolve(refreshRuntime());
      onSelect(fork.sessionId);

      if (mode === "retry" && retryPrompt) {
        const accepted = await sendMessage({
          input: retryPrompt.content,
          attachments: retryPrompt.attachments ?? [],
          sessionId: fork.sessionId,
          memoryMatchOverride: retryPrompt.memoryMatch,
          projectIdOverride: fork.projectId ?? null,
        });
        setQueueAnnouncement(
          accepted
            ? "Retry started in a new branch. The original response is unchanged."
            : "The branch was created, but the retry could not be started.",
        );
      } else {
        setQueueAnnouncement(
          mode === "edit"
            ? "Branch created. Edit the restored prompt and send when ready."
            : `Forked ${fork.copiedMessageCount} ${
                fork.copiedMessageCount === 1 ? "message" : "messages"
              } into a new conversation.`,
        );
        if (mode === "edit") {
          requestAnimationFrame(() => composerRef.current?.focus());
        }
      }
    } catch (error) {
      setQueueAnnouncement(
        `Could not create the branch: ${errorMessage(error)}`,
      );
    } finally {
      setForkingMessageId("");
    }
  }

  const queuedDeliveryStatus = (message: PersistedQueuedMessage) =>
    !message.workspacePath
      ? "legacy-unbound"
      : scopeForSession
        ? queuedMessageMatchesConfirmedScope(
            message,
            scopeForSession(message.sessionId),
            window.doolittle.platform,
          )
          ? "ready"
          : "different-workspace"
        : queuedMessageWorkspaceStatus(
            message,
            workspacePath,
            window.doolittle.platform,
          );

  const dispatchQueuedMessage = useEffectEvent(
    async (next: PersistedQueuedMessage) => {
      queueDispatchRef.current = next.id;
      let accepted = false;
      try {
        accepted = await sendMessage({
          input: next.content,
          attachments: next.attachments,
          attachmentCleanup: next.attachmentCleanup,
          sessionId: next.sessionId,
          memoryMatchOverride: next.memoryMatch,
          projectIdOverride: next.projectId ?? null,
          contextCapsule: next.capsule,
          composedContentOverride: composeQueuedMessage(next),
        });
      } catch (error) {
        setDispatchFeedback((current) => ({
          ...current,
          [next.sessionId]: errorMessage(error),
        }));
      } finally {
        // Publishing the next queue state can synchronously wake subscribers.
        queueDispatchRef.current = null;
        if (accepted) {
          setQueuedMessages((current) =>
            current.filter((message) => message.id !== next.id),
          );
        } else {
          setQueuePaused(true);
          setQueueAnnouncement(
            "Queued delivery failed and was paused for review.",
          );
        }
      }
    },
  );

  const queueHead = queuedMessages[0];
  const queueRun = queueHead && activeRequests[queueHead.sessionId];
  const queueDispatchPending =
    queueHead && dispatchPending[queueHead.sessionId];
  const queueHeadHydration = queueHead
    ? runHydrationForBot(resolveSessionBot(queueHead.sessionId))
    : "checking";
  const queueTargetReady =
    hostBackend.phase === "ready" && queueHeadHydration === "ready";
  const queueWorkspaceStatus = queueHead && queuedDeliveryStatus(queueHead);
  useEffect(() => {
    if (
      !coordinator ||
      !queueHead ||
      !queueTargetReady ||
      queuePaused ||
      queueRun ||
      queueDispatchPending ||
      queueDispatchRef.current ||
      runClaims.current.forSession(queueHead.sessionId)
    ) {
      return;
    }
    if (queueWorkspaceStatus !== "ready") {
      setQueuePaused(true);
      setQueueAnnouncement(
        queueWorkspaceStatus === "different-workspace"
          ? "Queued delivery is paused because its saved chat scope differs or is unavailable. The message is retained."
          : "Queued delivery is paused because this recovered message has no confirmed workspace. The message is retained.",
      );
      return;
    }
    void dispatchQueuedMessage(queueHead);
  }, [
    coordinator,
    queueDispatchPending,
    queueDispatchRef,
    queueHead,
    queuePaused,
    queueRun,
    queueTargetReady,
    queueWorkspaceStatus,
    runClaims,
    setQueuePaused,
    setQueueAnnouncement,
  ]);

  const queueScope = scopeForSession?.(selectedId);
  const queueScopeReady =
    !readOnlyChat &&
    runHydration === "ready" &&
    !workspaceBindingBlocked &&
    (!scopeForSession || queueScope?.kind === "confirmed");
  const queueCurrentDraft = () => {
    if (!queueScopeReady) return;
    if (attachmentImportPending) {
      setAttachmentValidationError(
        "Wait for file import to finish before queueing this message.",
      );
      return;
    }
    const visibleContent = chatSubmissionContent(draft, attachedFiles.length);
    const content = composeChatContextMessage(
      visibleContent,
      chatContextCapsule,
    );
    if (!content || !selectedId) return;
    if (isCommandMessage(content) && attachedFiles.length > 0) {
      setAttachmentValidationError(
        "Remove message attachments before queueing a command.",
      );
      return;
    }
    setQueuedMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sessionId: selectedId,
        workspacePath:
          queueScope?.kind === "confirmed"
            ? queueScope.conversation.workspacePath
            : workspacePath,
        ...(queueScope?.kind === "confirmed"
          ? {
              ...(queueScope.conversation.projectId
                ? { projectId: queueScope.conversation.projectId }
                : {}),
              botId: queueScope.conversation.botId,
            }
          : {}),
        content: visibleContent,
        ...(chatContextCapsule ? { capsule: chatContextCapsule } : {}),
        attachments: attachedFiles,
        ...(Object.keys(draftAttachmentCleanup).length > 0
          ? { attachmentCleanup: draftAttachmentCleanup }
          : {}),
        memoryMatch: freezeMemoryMatchSnapshot(content, memoryMatches),
      },
    ]);
    if (queuedMessages.length === 0) setQueuePaused(false);
    setQueueAnnouncement(
      queuePaused && queuedMessages.length > 0
        ? "Message added. The queue is still paused."
        : "Message added to the queue.",
    );
    clearDraftForDispatch(selectedId);
    composerRef.current?.focus();
  };

  const resumeQueuedMessages = () => {
    const [next] = queuedMessages;
    if (!next) return;
    const workspaceStatus = queuedDeliveryStatus(next);
    if (workspaceStatus === "different-workspace") {
      setQueuePaused(true);
      setQueueAnnouncement(
        "This queued message has no matching confirmed chat scope. It remains queued; start a new chat for this project.",
      );
      return;
    }
    if (workspaceStatus === "legacy-unbound") {
      setQueuePaused(true);
      setQueueAnnouncement(
        "Recovered message has no confirmed workspace. Start a new chat; this queue item is retained.",
      );
      return;
    } else {
      setQueueAnnouncement(
        "Recovered queue resumed. The next message will send when Doolittle is ready.",
      );
    }
    setQueuePaused(false);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (attachmentImportPending) {
      setAttachmentValidationError(
        "Wait for file import to finish before sending.",
      );
      return;
    }
    if (activeRequest) {
      queueCurrentDraft();
      return;
    }
    await sendMessage({
      input: draft,
      attachments: attachedFiles,
      attachmentCleanup: draftAttachmentCleanup,
      sessionId: selectedId,
      clearComposer: true,
      contextCapsule: chatContextCapsule,
    });
  };

  const createConversation = () => {
    const id = newConversationId();
    if (currentBotId) onBindSessionBot?.(id, currentBotId);
    onCaptureSessionProject?.(id, null);
    setMessages((current) => ({ ...current, [id]: [] }));
    onSelect(id);
  };

  const unreadMessageCount = unreadMessageIdsBySession[selectedId]?.length ?? 0;
  const jumpToLatestMessages = useCallback(() => {
    transcriptFollowRef.current = true;
    setUnreadMessageIdsBySession((current) =>
      current[selectedId]?.length ? { ...current, [selectedId]: [] } : current,
    );
    endRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [prefersReducedMotion, selectedId]);

  const insertDictationTranscript = useCallback(
    (transcript: string) => {
      setDraft((current) => {
        const trimmed = current.trimEnd();
        return trimmed ? `${trimmed} ${transcript}` : transcript;
      });
      // setDraft retains the recording's conversation; only visible controls
      // and focus follow the currently selected conversation.
      if (
        selectedIdRef.current !== selectedId ||
        !composerPresentationActiveRef.current
      )
        return;
      setCommandMenuDismissed(false);
      requestAnimationFrame(() => {
        if (
          selectedIdRef.current === selectedId &&
          composerPresentationActiveRef.current
        )
          composerRef.current?.focus();
      });
    },
    [selectedId, setDraft],
  );

  const visibleQueuedMessages = queuedMessages.filter(
    (message) => message.sessionId === selectedId,
  );
  const queueHeadInAnotherChat = queueHead?.sessionId !== selectedId;
  const queueStatus =
    queueHead && queueWorkspaceStatus && visibleQueuedMessages.length > 0
      ? queueHeadStatus({
          otherConversation: queueHeadInAnotherChat,
          workspaceStatus: queueWorkspaceStatus,
          paused: queuePaused,
          runtimeReady: hostBackend.phase === "ready",
          hydration: queueHeadHydration,
          busy: Boolean(
            queueRun ||
              queueDispatchPending ||
              runClaims.current.forSession(queueHead.sessionId),
          ),
        })
      : "";

  const removeQueuedMessages = (messageId?: string) => {
    const dispatchingId = queueDispatchRef.current;
    const removed = queuedMessageRemovalTargets(queuedMessages, {
      sessionId: selectedId,
      dispatchingId,
      messageId,
      resolveSessionBot,
    });
    if (removed.length === 0) return;
    const removedIds = new Set(removed.map(({ message }) => message.id));
    setQueuedMessages((current) =>
      current.filter(
        (message) =>
          message.sessionId !== selectedId || !removedIds.has(message.id),
      ),
    );
    const { length: count } = removed;
    setQueueAnnouncement(
      `${count} queued ${count === 1 ? "message" : "messages"} removed.`,
    );
    for (const { message, botId } of removed) {
      void cleanupManagedAttachments(
        message.attachments.map((attachment) => attachment.id),
        message.attachmentCleanup ?? {},
        botId,
      ).catch(() => undefined);
    }
    const index = visibleQueuedMessages
      .filter((message) => message.id !== dispatchingId)
      .findIndex((message) => message.id === messageId);
    requestAnimationFrame(() => {
      if (selectedIdRef.current !== selectedId) return;
      const buttons = queueRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-queue-remove]:enabled",
      );
      const nextButton =
        index >= 0 && buttons?.[Math.min(index, buttons.length - 1)];
      if (nextButton) nextButton.focus();
      else composerRef.current?.focus();
    });
  };

  const toggleInspector = () => {
    setInspectorVisible((current) => !current);
  };

  const runtimeProvider =
    currentBot?.model.provider ?? runtime?.provider ?? "Loading provider";
  const runtimeModel =
    currentBot?.model.model ?? runtime?.model ?? "Loading model";
  const modelRouteLabel = `${runtimeProvider} · ${runtimeModel}`;
  const attachmentTotalBytes = attachedFiles.reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0,
  );
  const composerValidationError =
    isCommandMessage(draft.trim()) && attachedFiles.length > 0
      ? "Commands cannot be sent with file context. Remove the attachments or send a normal message."
      : "";
  const canSubmit =
    !readOnlyChat &&
    Boolean(draft.trim() || attachedFiles.length > 0) &&
    hostBackend.phase === "ready" &&
    !workspaceBindingBlocked &&
    (!botIdForSession || Boolean(currentBotId)) &&
    !dispatchPending[selectedId] &&
    botCanDispatch &&
    runHydration === "ready" &&
    !attachmentImportPending &&
    !composerValidationError;
  const canQueue =
    queueScopeReady &&
    Boolean(
      selectedId &&
        (draft.trim() || attachedFiles.length || chatContextCapsule),
    ) &&
    !attachmentImportPending &&
    !composerValidationError;
  const isNewConversation =
    selectedMessages.length === 0 &&
    (selectedSession?.messageCount ?? 0) === 0 &&
    !activeRequest;
  // History recovery stays in the active layout until its outcome is known.
  // Only presentation changes; the composer and transcript keep their identity.
  const isEmptyConversation =
    isNewConversation &&
    !readOnlyChat &&
    loadingHistory !== selectedId &&
    !historyError;
  const composerDockRef = useRef<HTMLDivElement>(null);
  const inspectorPresence = useSurfacePresence(inspectorVisible);
  useLiquidLayout(
    composerDockRef,
    `${isEmptyConversation}:${inspectorPresence.present}:${surface}`,
    selectedId,
  );
  const workbenchAccessibilityProps = isNarrowViewport
    ? {
        "aria-label": "Thread workbench",
        "aria-modal": true as const,
        role: "dialog" as const,
        tabIndex: -1,
      }
    : {
        "aria-label": "Thread workbench",
        role: "region" as const,
      };
  const hasDispatchNotice =
    Boolean(activeRequest && runConnection) ||
    Boolean(dispatchFeedback[selectedId]) ||
    dispatchPending[selectedId] ||
    runHydration !== "ready" ||
    workspaceBindingBlocked ||
    (!botReady && (!currentBot || !activeRequest));
  const promotionNotice = promotionFeedback[selectedId];

  if (coordinator) return null;

  return (
    <div
      className={`chat-workspace ${
        inspectorPresence.present ? "inspector-open" : "inspector-closed"
      }${inspectorVisible && isNarrowWorkbench ? " inspector-sheet" : ""}`}
      ref={workspaceRef}
    >
      {chromeHost
        ? createPortal(
            <ChatHeaderChrome
              selectedId={selectedId}
              inspectorVisible={inspectorVisible}
              isNewConversation={isNewConversation}
              onOpenWorkspace={() => openComputerView("code")}
              onOpenSettings={onOpenSettings}
              onToggleInspector={toggleInspector}
              onTogglePin={() => togglePin(selectedId)}
              onSurfaceChange={onSurfaceChange}
              selectedSession={selectedSession}
              surface={surface}
              workbenchToggleRef={workbenchToggleRef}
            />,
            chromeHost,
          )
        : null}
      <ConversationFrame
        aria-hidden={
          (inspectorVisible && isNarrowWorkbench) || surface !== "conversation"
            ? "true"
            : undefined
        }
        aria-label="Conversation detail"
        className="chat-conversation"
        data-run-hydration={runHydration}
        data-layout={isEmptyConversation ? "empty" : "active"}
        hidden={surface !== "conversation"}
        id={`chat-context-conversation-${selectedId}`}
        inert={
          (inspectorVisible && isNarrowWorkbench) || surface !== "conversation"
        }
      >
        <div className="chat-transcript-region">
          <ChatTranscript
            sessionId={selectedId}
            botName={currentBot?.name}
            activeRequest={activeRequest}
            backendReady={backend.phase === "ready" && !readOnlyChat}
            copyStates={copyStates}
            endRef={endRef}
            forkingMessageId={forkingMessageId}
            historyError={historyError}
            hasEarlierMessages={hasEarlierMessages}
            loadingEarlierHistory={
              loadingEarlierHistory === selectedId ||
              loadingHistory === selectedId
            }
            loading={loadingHistory === selectedId}
            messages={selectedMessages}
            onBranch={(message, mode) => void branchMessage(message, mode)}
            onCopy={(message) =>
              void copyMessage(
                message.id,
                message.role === "assistant"
                  ? visibleAssistantText(message.content)
                  : message.content,
              )
            }
            onRead={readMessage}
            onPromote={
              currentBotId && !readOnlyChat ? promoteMessage : undefined
            }
            onRetryHistory={() => retryHistory(selectedId)}
            onRetryMessage={
              readOnlyChat
                ? undefined
                : (message) => void branchMessage(message, "retry")
            }
            onLoadEarlier={() => loadEarlierHistory(selectedId)}
            onViewChanges={() => {
              setInspectorVisible(true);
              setInspectorTab("changes");
            }}
            onSelectPrompt={(prompt) => {
              setDraft(prompt);
              requestAnimationFrame(() => composerRef.current?.focus());
            }}
            onStopReading={stopSpeaking}
            progress={runConnection ? "" : progress}
            projectName={activeProject?.name}
            runReceipts={runReceipts}
            speakingMessageId={speakingMessageId}
            speechSupported={speechSupported}
          />
          <div className="chat-transcript-bottom">
            {unreadMessageCount > 0 ? (
              <button
                aria-label={`Jump to latest messages (${unreadMessageCount} new)`}
                className="chat-jump-to-latest"
                onClick={jumpToLatestMessages}
                type="button"
              >
                <UiIcon icon={ArrowDown} />
                <span>Jump to latest</span>
                <span className="chat-jump-count">
                  {unreadMessageCount} new
                </span>
              </button>
            ) : null}
            {promotionNotice ||
            storageWarning ||
            visibleRunHydrationWarnings.length ? (
              <div className="chat-panel-notices">
                {promotionNotice ? (
                  <ChatNotice
                    tone={promotionNotice.error ? "error" : "neutral"}
                  >
                    {promotionNotice.error ?? promotionNotice.message}
                  </ChatNotice>
                ) : null}
                {storageWarning ? (
                  <ChatNotice tone="warning">{storageWarning}</ChatNotice>
                ) : null}
                {visibleRunHydrationWarnings.length ? (
                  <ChatNotice tone="warning">
                    Some agent history could not be loaded.
                  </ChatNotice>
                ) : null}
              </div>
            ) : null}
            <div aria-live="polite" className="sr-only" role="status">
              {accessibilityStatus}
            </div>
          </div>
        </div>
        {readOnlyChat ? (
          <p className="chat-read-only" role="status">
            <UiIcon icon={LockKeyhole} />
            Read-only conversation history
          </p>
        ) : null}
        <div
          className="chat-composer-dock"
          hidden={readOnlyChat}
          inert={readOnlyChat}
          ref={composerDockRef}
        >
          <ChatComposer
            bot={currentBot}
            approvalBotId={currentBotId}
            approvalsVisible={approvalsVisible}
            workspaceNotice={
              hasDispatchNotice ? (
                <div className="chat-dispatch-notices">
                  {activeRequest && runConnection ? (
                    <ChatNotice
                      action={{
                        label: "Reconnect",
                        invoke: () => void reconnectRequest(activeRequest),
                        disabled: runConnection === "reconnecting",
                      }}
                      tone="warning"
                    >
                      {runConnection === "reconnecting"
                        ? "Reconnecting to the response…"
                        : "Response stream disconnected. The run may still be active."}
                    </ChatNotice>
                  ) : null}
                  {dispatchFeedback[selectedId] ? (
                    <ChatNotice tone="error">
                      {dispatchFeedback[selectedId]}
                    </ChatNotice>
                  ) : null}
                  {dispatchPending[selectedId] ? (
                    <ChatNotice>
                      Confirming this conversation’s owner…
                    </ChatNotice>
                  ) : null}
                  {runHydration !== "ready" ? (
                    <ChatNotice
                      action={
                        runHydration === "unavailable"
                          ? {
                              label: "Retry run list",
                              invoke: retryRunHydration,
                            }
                          : undefined
                      }
                      tone={
                        runHydration === "unavailable" ? "warning" : "neutral"
                      }
                    >
                      {runHydration === "checking"
                        ? "Checking active runs before sending…"
                        : "Active runs could not be recovered. Retry before sending."}
                    </ChatNotice>
                  ) : null}
                  {workspaceBindingBlocked ? (
                    <ChatNotice
                      action={
                        pendingProject?.primaryPath && onConfirmProjectAccess
                          ? {
                              label: "Confirm project access",
                              invoke: () => onConfirmProjectAccess(selectedId),
                            }
                          : foreignProject && onActivateSessionProject
                            ? {
                                label: "Activate workspace",
                                invoke: () =>
                                  onActivateSessionProject(
                                    selectedId,
                                    foreignProject.id,
                                  ),
                              }
                            : {
                                label: "Resolve repository",
                                invoke: () => {
                                  if (onChooseRepository)
                                    void onChooseRepository(selectedId);
                                  else onOpenProjectManager?.();
                                },
                              }
                      }
                      tone="warning"
                    >
                      {pendingProject
                        ? `Confirm access to ${pendingProject.name} before sending.`
                        : foreignProject
                          ? `Activate ${foreignProject.name} to send in this conversation.`
                          : "Confirm this conversation’s workspace before sending."}
                    </ChatNotice>
                  ) : null}
                  {!botReady && currentBot && !activeRequest ? (
                    <BotRuntimeNotice
                      bot={currentBot}
                      onStart={onActivateBot}
                    />
                  ) : null}
                  {!botReady && !currentBot ? (
                    <ChatNotice
                      action={{
                        label: "Refresh bot list",
                        invoke: refreshRuntime,
                      }}
                      tone="error"
                    >
                      This conversation’s bot is unavailable. Refresh the bot
                      list to continue.
                    </ChatNotice>
                  ) : null}
                </div>
              ) : null
            }
            workspaceTarget={workspaceTarget}
            workspaceBound={Boolean(confirmedWorkspace)}
            projects={projects}
            onChooseRepository={() => onChooseRepository?.(selectedId)}
            onOpenProjectManager={onOpenProjectManager}
            onSelectProjectForNewChat={
              onSelectProjectForNewChat
                ? (scope) => onSelectProjectForNewChat(scope, selectedId)
                : undefined
            }
            backend={backend}
            runtime={runtime}
            refreshRuntime={refreshRuntime}
            onOpenModelsPage={onOpenModelsPage}
            onOpenProvidersPage={onOpenProvidersPage}
            activeRequest={activeRequest}
            cancellingRequest={cancellingRequest}
            onCancelRequest={(requestId) => void cancelRequest(requestId)}
            canSubmit={canSubmit}
            canQueue={canQueue}
            canDraft={canDraft}
            draft={draft}
            setDraft={setDraft}
            onSubmit={submit}
            onSendAnswers={(text) =>
              sendMessage({
                input: text,
                attachments: [],
                sessionId: selectedId,
              })
            }
            composerRef={composerRef}
            queueRef={queueRef}
            queuedMessages={visibleQueuedMessages}
            queueDispatchingId={queueDispatchRef.current}
            queuePaused={queuePaused && !queueHeadInAnotherChat}
            queueStatus={queueStatus}
            onOpenQueueHead={
              queueHead && queueHeadInAnotherChat
                ? () => onSelect(queueHead.sessionId, true)
                : undefined
            }
            resumeQueuedMessages={resumeQueuedMessages}
            setQueueAnnouncement={setQueueAnnouncement}
            clearQueuedMessages={() => removeQueuedMessages()}
            removeQueuedMessage={removeQueuedMessages}
            attachedFiles={attachedFiles}
            attachmentImporting={attachmentImportPending}
            attachmentNotice={attachmentValidationError}
            chatContextCapsule={chatContextCapsule}
            removeChatContext={() => setChatContextCapsule(null)}
            attachmentTotalBytes={attachmentTotalBytes}
            removeContextFile={removeContextFile}
            composerValidationError={composerValidationError}
            memoryMatches={memoryMatches}
            commandSuggestions={commandSuggestions}
            commandMenuDismissed={commandMenuDismissed}
            commandSelection={commandSelection}
            setCommandSelection={setCommandSelection}
            setCommandMenuDismissed={setCommandMenuDismissed}
            selectCommandSuggestion={selectCommandSuggestion}
            commandCatalog={commandCatalog}
            pickContextFiles={pickContextFiles}
            importAndTranscribeRecording={importAndTranscribeRecording}
            insertDictationTranscript={insertDictationTranscript}
            selectedContext={selectedContext}
            selectedContextPercent={selectedContextPercent}
            selectedContextTone={selectedContextTone}
            selectedUsageError={selectedUsageError}
            usageLoading={usageLoading}
            selectedId={selectedId}
            modelRouteLabel={modelRouteLabel}
            workspacePath={workspacePath}
            runningTasks={runningTasks}
          />
        </div>
      </ConversationFrame>
      <section
        aria-hidden={surface !== "history" ? "true" : undefined}
        aria-label="Conversation history"
        className="chat-context-surface"
        hidden={surface !== "history"}
        id={`chat-context-history-${selectedId}`}
        inert={surface !== "history"}
      >
        {surface === "history" || visitedHistory ? (
          <Suspense fallback={<DesktopRouteLoadingFallback label="history" />}>
            <SessionsPage
              active={backend.phase === "ready" && surface === "history"}
              embedded
              onNewConversation={() => {
                if (onRequestNewConversation) {
                  onRequestNewConversation();
                  return;
                }
                createConversation();
                onSurfaceChange?.("conversation");
                requestAnimationFrame(() => composerRef.current?.focus());
              }}
              openChat={(sessionId) => {
                onSelect(sessionId);
                onSurfaceChange?.("conversation");
                requestAnimationFrame(() => composerRef.current?.focus());
              }}
              projectId={activeProject?.id}
              refresh={refreshRuntime}
              sessions={sessions}
            />
          </Suspense>
        ) : null}
      </section>
      <section
        aria-hidden={surface !== "media" ? "true" : undefined}
        aria-label="Media tools"
        className="chat-context-surface"
        hidden={surface !== "media"}
        id={`chat-context-media-${selectedId}`}
        inert={surface !== "media"}
      >
        {surface === "media" || visitedMedia ? (
          <Suspense fallback={<DesktopRouteLoadingFallback label="media" />}>
            <MediaPage
              active={
                backend.phase === "ready" &&
                surface === "media" &&
                Boolean(currentBotId)
              }
              botId={currentBotId || undefined}
              embedded
              onOpenConversation={(sessionId) => {
                onSelect(sessionId, true);
                onSurfaceChange?.("conversation");
              }}
              sessionId={selectedId}
            />
          </Suspense>
        ) : null}
      </section>
      {inspectorPresence.present ? (
        <div
          {...workbenchAccessibilityProps}
          aria-hidden={!inspectorVisible || undefined}
          inert={!inspectorVisible}
          data-state={inspectorPresence.state}
          className="chat-workbench-pane max-[720px]:fixed max-[720px]:inset-0 max-[720px]:w-full"
          id={`thread-workbench-${selectedId}`}
          ref={workbenchDialogRef}
        >
          <CompanionInspector
            active={
              inspectorVisible &&
              backend.phase === "ready" &&
              routeActive &&
              visible
            }
            bot={currentBot}
            botId={currentBotId || undefined}
            contextLabel={selectedContextLabel}
            fullWidth={isNarrowWorkbench}
            messageCount={selectedMessageCount}
            onClose={closeInspector}
            onInsertContext={insertChatContext}
            onOpenFullView={openComputerView}
            onTabChange={setInspectorTab}
            resize={
              inspectorVisible && !isNarrowWorkbench
                ? {
                    bounds: inspectorBounds,
                    onResize: resizeInspector,
                    value: inspectorWidth,
                  }
                : undefined
            }
            sessionId={selectedId}
            tab={inspectorTab}
            title={selectedSession?.title || "New conversation"}
            width={isNarrowWorkbench ? undefined : inspectorWidth}
            workspacePath={workspacePath}
            workspaceLabel={
              selectedScope?.kind === "confirmed"
                ? selectedScope.conversation.projectId
                  ? (selectedScope.conversation.projectContext?.name ??
                    "Project workspace")
                  : "Private scratch"
                : (pendingProject?.name ??
                  (workspacePath || "Workspace unconfirmed"))
            }
          />
        </div>
      ) : null}
      <RouteControlDialog
        isOpen={routeDialogOpen && visible && focused}
        onClose={() => setRouteDialogOpen(false)}
        onOpenModelsPage={() => {
          setRouteDialogOpen(false);
          onOpenModelsPage();
        }}
        refreshRuntime={refreshRuntime}
        runtime={runtime}
      />
      {promotionSource && visible && focused ? (
        <Suspense fallback={<p role="status">Opening sharing controls…</p>}>
          <KnowledgePromotionDialog
            source={promotionSource}
            onClose={() => setPromotionSource(undefined)}
            onSaved={(sessionId) => {
              setPromotionFeedback((current) => ({
                ...current,
                [sessionId]: {
                  busy: false,
                  message:
                    "Saved privately. Grant access in Memory → Shared knowledge to share it with a bot.",
                },
              }));
              window.dispatchEvent(new Event("doolittle:knowledge-changed"));
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
