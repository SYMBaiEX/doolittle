import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import {
  type FormEvent,
  lazy,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  BackendState,
  ChatEvent,
  RuntimeStatus,
  SessionForkResponse,
  SessionSummary,
} from "../shared/contracts";
import { ChatHeaderChrome } from "./chat/ChatHeaderChrome";
import {
  CompanionInspector,
  type InspectorTab,
} from "./chat/CompanionInspector";
import { isChatNearBottom, scheduleChatScroll } from "./chat/chat-scroll";
import { handleFailedChatTerminalEvent } from "./chat/chat-terminal-events";
import { addUnreadMessageIds, appendedMessageIds } from "./chat/chat-unread";
import { snapshotDraftForDispatch } from "./chat/draft-dispatch-recovery";
import {
  CHAT_WORKSPACE_CLASS,
  MOBILE_CONVERSATIONS_BACKDROP_CLASS,
  MOBILE_CONVERSATIONS_DIALOG_CLASS,
  MOBILE_CONVERSATIONS_DISMISS_CLASS,
} from "./chat/layout";
import {
  type BranchMode,
  type DisplayMessage,
  historicalRunReceipt,
  isDesktopRunUpdate,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
  type RunReceiptStore,
  runEventKey,
} from "./chat/models";
import {
  completedResponseText,
  reconcileStreamedResponse,
  streamedResponseFrameKey,
} from "./chat/streamed-response";
import { useChatComposerSupport } from "./chat/useChatComposerSupport";
import { useChatConversationState } from "./chat/useChatConversationState";
import { useChatMessageActions } from "./chat/useChatMessageActions";
import type {
  ChatContextCapsule,
  ChatContextHandoff,
} from "./chat-context-handoff";
import { composeChatContextMessage } from "./chat-context-handoff";
import { visibleAssistantText } from "./components/message-output";
import { RouteControlDialog } from "./components/RouteControlDialog";
import type { ThreadWorkbenchFullView } from "./components/ThreadWorkbenchRail";
import { useModalFocusBoundary } from "./components/useModalFocusBoundary";
import type { VoiceRecorderMime } from "./components/VoiceComposerButton";
import { newConversationId } from "./conversation-id";
import {
  composeQueuedMessage,
  loadConversationQueue,
  type PersistedQueuedMessage,
  queuedMessageWorkspaceStatus,
  safeSetStorageItem,
  saveConversationQueue,
} from "./conversation-persistence";
import { desktopRequest, errorMessage } from "./lib";
import {
  freezeMemoryMatchSnapshot,
  type MemoryMatchSnapshot,
} from "./memory-matches";
import type { ProjectLike, ProjectScope } from "./project-manager/models";
import {
  useWorkspaceRef,
  useWorkspaceState,
} from "./session-workspace/chat-workspace-store";
import type { ChatPanelViewState } from "./session-workspace/panel-view-state";
import { SessionWorkspace } from "./session-workspace/SessionWorkspace";
import { sessionWorkspaceBinding } from "./session-workspace/session-workspace-binding";

const INSPECTOR_STORAGE_KEY = "doolittle.desktop.chat-inspector-visible.v1";
const RUN_CURSOR_STORAGE_KEY = "doolittle.desktop.chat-run-cursors.v1";
const NARROW_WORKBENCH_QUERY = "(max-width: 720px)";
const ATTACHMENT_ONLY_MESSAGE = "Review the attached files.";

export type ChatSurface = "conversation" | "history" | "media";

/** The transcript needs a useful user intent even when file context is the only input. */
export function chatSubmissionContent(
  draft: string,
  attachmentCount: number,
): string {
  const trimmed = draft.trim();
  return trimmed || attachmentCount > 0
    ? trimmed || ATTACHMENT_ONLY_MESSAGE
    : "";
}

/** Progress belongs to its originating conversation, not whichever view is selected. */
export function setSessionProgress(
  progressBySession: Readonly<Record<string, string>>,
  sessionId: string,
  progress: string,
): Record<string, string> {
  if (progressBySession[sessionId] === progress) return progressBySession;
  return { ...progressBySession, [sessionId]: progress };
}

export function clearSessionProgress(
  progressBySession: Readonly<Record<string, string>>,
  sessionId: string,
): Record<string, string> {
  if (!(sessionId in progressBySession)) return progressBySession;
  const { [sessionId]: _cleared, ...remaining } = progressBySession;
  return remaining;
}

function loadRunCursors(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(RUN_CURSOR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, cursor]) =>
          /^[a-zA-Z0-9:_-]{1,128}$/u.test(id) &&
          Number.isSafeInteger(cursor) &&
          Number(cursor) >= 0,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveRunCursors(cursors: Record<string, number>): void {
  const bounded = Object.fromEntries(Object.entries(cursors).slice(-100));
  safeSetStorageItem(
    sessionStorage,
    RUN_CURSOR_STORAGE_KEY,
    JSON.stringify(bounded),
  );
}
const ChatComposer = lazy(async () => {
  const module = await import("./chat/ChatComposer");
  return { default: module.ChatComposer };
});
const ChatTranscript = lazy(async () => {
  const module = await import("./chat/ChatTranscript");
  return { default: module.ChatTranscript };
});
const MediaPage = lazy(async () => {
  const module = await import("./MediaPage");
  return { default: module.MediaPage };
});
const SessionsPage = lazy(async () => {
  const module = await import("./sessions/SessionsPage");
  return { default: module.SessionsPage };
});
const MobileConversationsDialog = lazy(async () => {
  const module = await import("./chat/MobileConversationsDialog");
  return { default: module.MobileConversationsDialog };
});

function MobileConversationsDialogFallback({
  selectedId,
  backdropRef,
  dialogRef,
  onClose,
}: {
  selectedId: string;
  backdropRef: RefObject<HTMLDivElement | null>;
  dialogRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  return (
    <div className={MOBILE_CONVERSATIONS_BACKDROP_CLASS} ref={backdropRef}>
      <button
        aria-label="Close conversations"
        className={MOBILE_CONVERSATIONS_DISMISS_CLASS}
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Conversations"
        aria-modal="true"
        className={MOBILE_CONVERSATIONS_DIALOG_CLASS}
        id={`mobile-conversations-${selectedId}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div
          aria-live="polite"
          className="grid min-h-32 place-items-center gap-2 text-[var(--muted)]"
          role="status"
        >
          <button
            aria-label="Close conversations"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-[var(--text-soft)]"
            data-mobile-conversation
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          Loading conversations…
        </div>
      </div>
    </div>
  );
}

function loadInspectorVisibility(): boolean {
  try {
    const value = localStorage.getItem(INSPECTOR_STORAGE_KEY);
    return value ? JSON.parse(value) === true : false;
  } catch {
    return false;
  }
}

function eventText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return (
    ([record.detail, record.message, record.event].find(
      (value) => typeof value === "string",
    ) as string | undefined) ?? ""
  );
}

function isCommandMessage(message: string): boolean {
  return message.startsWith("/") || message.startsWith("!");
}
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
  onBindSessionBot?: (sessionId: string, botId: string) => void;
  onActivateBot?: (botId: string) => Promise<void>;
  routeActive?: boolean;
  backend: BackendState;
  runtime: RuntimeStatus | null;
  remoteSessions: SessionSummary[];
  sessionMetadata?: readonly SessionSummary[];
  selectedId: string;
  workspacePath: string;
  onSelect: (sessionId: string) => void;
  refreshRuntime: () => void;
  onOpenModelsPage: () => void;
  onOpenProvidersPage: () => void;
  onOpenWorkspaceView: (view: ThreadWorkbenchFullView) => void;
  onConsumeContextHandoff: (id: string) => void;
  activeProject?: {
    id: string;
    name: string;
    color?: string | null;
    primaryPath?: string | null;
  } | null;
  projects?: readonly ProjectLike[];
  projectLabels?: Readonly<Record<string, string>>;
  onChooseRepository?: (sessionId?: string) => void | Promise<void>;
  onOpenProjectManager?: () => void;
  onSelectProjectForNewChat?: (scope: ProjectScope) => void;
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
  onBindSessionBot,
  onActivateBot,
  routeActive = true,
  backend,
  runtime,
  remoteSessions,
  selectedId,
  workspacePath,
  onSelect,
  refreshRuntime,
  onOpenModelsPage,
  onOpenProvidersPage,
  onOpenWorkspaceView,
  onConsumeContextHandoff,
  activeProject,
  projects,
  projectLabels,
  onChooseRepository,
  onOpenProjectManager,
  onSelectProjectForNewChat,
  onRequestNewConversation,
  onActivateSessionProject,
  pendingApprovals,
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
  const [activeRequests, setActiveRequests] = useWorkspaceState<
    Record<string, string>
  >("run.active-requests", {});
  const activeRequestSessionsRef = useWorkspaceRef<Record<string, true>>(
    "run.claims",
    {},
  );
  const requestSession = useWorkspaceRef<Record<string, string>>(
    "run.sessions",
    {},
  );
  const requestBot = useWorkspaceRef<Record<string, string>>(
    "run.bot-owners",
    {},
  );
  const activeRequest = activeRequests[selectedId] ?? null;
  const [runHydration, setRunHydration] = useWorkspaceState<
    "checking" | "ready" | "unavailable"
  >("run.hydration", "checking");
  const [runHydrationRetry, setRunHydrationRetry] = useWorkspaceState(
    "run.hydration-retry",
    0,
  );
  const {
    draft,
    draftAttachments,
    draftAttachmentCleanup,
    chatContextCapsule,
    clearDraftForDispatch,
    hasEarlierMessages,
    historyError,
    loadEarlierHistory,
    loadingEarlierHistory,
    loadingHistory,
    selectedMessages,
    selectedSession,
    sessionSearch,
    sessionsCount,
    storageWarning,
    sessions,
    setDraft,
    setDraftAttachments,
    setChatContextCapsule,
    setDraftForSession,
    setMessages,
    retryHistory,
    restoreDraftAfterRejectedDispatch,
    setSessionSearch,
    togglePin,
  } = useChatConversationState({
    activeRequest,
    backendReady: backend.phase === "ready" && !coordinator && visible,
    onSelect,
    remoteSessions,
    requestSession,
    selectedId,
    persistenceOwner: coordinator,
  });
  const latestSelectedMessage = selectedMessages.at(-1);
  const workspaceBinding = sessionWorkspaceBinding(
    selectedSession,
    projects,
    workspacePath,
    window.doolittle.platform,
  );
  const foreignProject =
    workspaceBinding.kind === "foreign" ? workspaceBinding.project : undefined;
  const workspaceBindingBlocked =
    workspaceBinding.kind === "foreign" || workspaceBinding.kind === "unknown";
  const currentBotId =
    botIdForSession?.(selectedId) || defaultBotId || selectedBotId;
  const currentBot = bots?.find((bot) => bot.id === currentBotId);
  const botReady =
    !currentBot ||
    currentBot.state === "ready" ||
    currentBot.state === "busy" ||
    currentBot.state === "waiting";
  const [progressBySession, setProgressBySession] = useWorkspaceState<
    Record<string, string>
  >("run.progress", {});
  const progress = progressBySession[selectedId] ?? "";
  const panelViewSnapshots = useWorkspaceRef<
    Record<string, ChatPanelViewState>
  >("view.snapshots", {});
  if (!coordinator && !panelViewSnapshots.current[selectedId]) {
    panelViewSnapshots.current[selectedId] = {
      scrollTop: 0,
      follow: true,
      inspectorVisible: loadInspectorVisibility(),
      unreadMessageIds: [],
      knownMessageIds: [],
    };
  }
  const savedView = coordinator
    ? undefined
    : panelViewSnapshots.current[selectedId];
  const [inspectorVisible, setInspectorVisible] = useState(
    () => savedView?.inspectorVisible ?? loadInspectorVisibility(),
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [narrowPanel, setNarrowPanel] = useState(false);
  useEffect(() => {
    const panel = workspaceRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const update = () =>
      setNarrowPanel(panel.clientWidth > 0 && panel.clientWidth < 720);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const isNarrowViewport = useMediaQuery(NARROW_WORKBENCH_QUERY);
  const isNarrowWorkbench = isNarrowViewport || narrowPanel;
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const attachedFiles = draftAttachments;
  const recoveredQueue = useMemo(() => loadConversationQueue(localStorage), []);
  const [queuedMessages, setQueuedMessages] = useWorkspaceState<
    PersistedQueuedMessage[]
  >("run.queue", recoveredQueue);
  const [queuePaused, setQueuePaused] = useWorkspaceState(
    "run.queue-paused",
    recoveredQueue.length > 0,
  );
  const [queueAnnouncement, setQueueAnnouncement] = useWorkspaceState(
    "run.queue-announcement",
    recoveredQueue.length > 0
      ? `${recoveredQueue.length} queued ${
          recoveredQueue.length === 1 ? "message was" : "messages were"
        } recovered. Review and resume when ready.`
      : "",
  );
  const [runReceipts, setRunReceipts] = useWorkspaceState<RunReceiptStore>(
    "run.receipts",
    {},
  );
  const [cancellingRequests, setCancellingRequests] = useWorkspaceState<
    Record<string, boolean>
  >("run.cancelling", {});
  const cancellingRequest =
    activeRequest && cancellingRequests[activeRequest] ? activeRequest : null;
  const clearCancellingRequest = (requestId: string) => {
    setCancellingRequests((current) => {
      if (!current[requestId]) return current;
      const { [requestId]: _removed, ...remaining } = current;
      return remaining;
    });
  };
  const runCursors = useWorkspaceRef<Record<string, number>>(
    "run.cursors",
    loadRunCursors(),
  );
  const seenRunEvents = useWorkspaceRef<Record<string, Set<number>>>(
    "run.seen-events",
    {},
  );
  const seenStreamParts = useWorkspaceRef<Record<string, Set<string>>>(
    "run.seen-parts",
    {},
  );
  const cancellationTimers = useWorkspaceRef<Record<string, number>>(
    "run.cancel-timers",
    {},
  );
  const pendingDeltas = useWorkspaceRef<
    Record<string, { sessionId: string; delta: unknown }>
  >("run.pending-deltas", {});
  const deltaFrame = useWorkspaceRef<number | null>("run.delta-frame", null);
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [attachmentValidationError, setAttachmentValidationError] =
    useWorkspaceState(`view.attachment-error.${selectedId}`, "");
  const [attachmentImportPending, setAttachmentImportPending] =
    useWorkspaceState(`view.attachment-importing.${selectedId}`, false);
  const attachmentRevisionRef = useRef(0);
  const [unreadMessageIdsBySession, setUnreadMessageIdsBySession] = useState<
    Record<string, string[]>
  >(() => (savedView ? { [selectedId]: savedView.unreadMessageIds } : {}));
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
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
  const mobileConversationsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileConversationsBackdropRef = useRef<HTMLDivElement>(null);
  const workbenchToggleRef = useRef<HTMLButtonElement>(null);
  const closeInspector = useCallback(() => {
    setInspectorVisible(false);
    requestAnimationFrame(() =>
      workbenchToggleRef.current?.focus({ preventScroll: true }),
    );
  }, []);
  const mobileConversationsDialogRef = useModalFocusBoundary({
    active: mobileConversationsOpen && visible && focused && !coordinator,
    initialFocusSelector: "[data-mobile-conversations-search]",
    isolationBoundaryRef: mobileConversationsBackdropRef,
    isolateBackground: true,
    onClose: () => setMobileConversationsOpen(false),
    restoreFocus: true,
    restoreFocusRef: mobileConversationsButtonRef,
  });
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
  const previousSelectedId = useRef(selectedId);
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

  useEffect(() => {
    selectedIdRef.current = selectedId;
    attachmentRevisionRef.current += 1;
  }, [selectedId]);

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

  const cleanupManagedAttachments = async (
    ids: readonly string[],
    attachmentCleanup: Readonly<Record<string, string>>,
  ) => {
    const byCapability = new Map<string, string[]>();
    for (const id of ids) {
      const capability = attachmentCleanup[id];
      if (!capability) continue;
      const entries = byCapability.get(capability) ?? [];
      entries.push(id);
      byCapability.set(capability, entries);
    }
    for (const [cleanupCapability, attachmentIds] of byCapability) {
      await window.doolittle.discardChatAttachments({
        attachmentIds,
        cleanupCapability,
      });
    }
  };

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
    saved.unreadMessageIds = unreadMessageIdsBySession[selectedId] ?? [];
    saved.knownMessageIds = selectedMessages.map((message) => message.id);
  }, [
    coordinator,
    inspectorVisible,
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
    saveConversationQueue(localStorage, queuedMessages);
  }, [queuedMessages]);

  useEffect(() => {
    safeSetStorageItem(
      localStorage,
      INSPECTOR_STORAGE_KEY,
      JSON.stringify(inspectorVisible),
    );
  }, [inspectorVisible]);

  useEffect(() => {
    if (!queueAnnouncement) return;
    const timeout = window.setTimeout(() => setQueueAnnouncement(""), 2_500);
    return () => window.clearTimeout(timeout);
  }, [queueAnnouncement, setQueueAnnouncement]);

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

  useEffect(() => {
    if (coordinator || previousSelectedId.current === selectedId) return;
    previousSelectedId.current = selectedId;
    setAttachmentValidationError("");
  }, [coordinator, selectedId, setAttachmentValidationError]);

  const selectedUpdatedAt =
    selectedSession?.endedAt ??
    selectedMessages.at(-1)?.createdAt ??
    selectedSession?.startedAt;
  const selectedMessageCount =
    selectedSession?.messageCount ?? selectedMessages.length;
  const latestAssistant = [...selectedMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const accessibilityStatus =
    loadingHistory === selectedId
      ? "Loading conversation."
      : queueAnnouncement ||
        progress ||
        (latestAssistant && !latestAssistant.pending
          ? "Doolittle replied."
          : "");

  const updateAssistant = useCallback(
    (
      sessionId: string,
      requestId: string,
      update: (message: DisplayMessage) => DisplayMessage,
    ) => {
      setMessages((current) => ({
        ...current,
        [sessionId]: (current[sessionId] ?? []).map((message) =>
          message.id === `assistant:${requestId}` ? update(message) : message,
        ),
      }));
    },
    [setMessages],
  );

  const flushPendingDeltas = useCallback(() => {
    if (deltaFrame.current !== null) {
      cancelAnimationFrame(deltaFrame.current);
      deltaFrame.current = null;
    }
    const pending = pendingDeltas.current;
    pendingDeltas.current = {};
    for (const [requestId, item] of Object.entries(pending)) {
      updateAssistant(item.sessionId, requestId, (message) => ({
        ...message,
        content: reconcileStreamedResponse(
          message.content,
          item.delta as { delta?: unknown; response?: unknown },
        ),
      }));
    }
  }, [updateAssistant, pendingDeltas, deltaFrame]);

  const finishRequest = (requestId: string) => {
    const cancellationTimer = cancellationTimers.current[requestId];
    if (cancellationTimer !== undefined) {
      window.clearTimeout(cancellationTimer);
      delete cancellationTimers.current[requestId];
    }
    clearCancellingRequest(requestId);
    delete seenStreamParts.current[requestId];
    const completedSessionId = requestSession.current[requestId];
    if (completedSessionId) {
      delete activeRequestSessionsRef.current[completedSessionId];
    }
    setActiveRequests((current) => {
      if (!completedSessionId || current[completedSessionId] !== requestId) {
        return current;
      }
      const { [completedSessionId]: _completed, ...remaining } = current;
      return remaining;
    });
    if (completedSessionId) {
      setProgressBySession((current) =>
        clearSessionProgress(current, completedSessionId),
      );
    }
    delete requestSession.current[requestId];
    refreshRuntime();
    if (completedSessionId) {
      void refreshSessionUsage(completedSessionId);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (cancellingRequests[requestId]) return;
    setCancellingRequests((current) => ({ ...current, [requestId]: true }));
    setQueueAnnouncement("Stopping the current response…");
    try {
      await window.doolittle.cancelChat(requestId);
      if (requestSession.current[requestId]) {
        cancellationTimers.current[requestId] = window.setTimeout(() => {
          delete cancellationTimers.current[requestId];
          clearCancellingRequest(requestId);
          setQueueAnnouncement(
            "Stopping is taking longer than expected. You can try stopping again while the runtime reconnects.",
          );
        }, 8_000);
      }
    } catch (error) {
      clearCancellingRequest(requestId);
      const sessionId = requestSession.current[requestId];
      if (!sessionId) return;
      updateAssistant(sessionId, requestId, (message) => ({
        ...message,
        content: `Cancellation failed: ${errorMessage(error)} Retry the response to continue.`,
        pending: false,
        error: true,
      }));
      finishRequest(requestId);
      setQueueAnnouncement("Cancellation failed. The response can be retried.");
    }
  };

  const handleChatEvent = useEffectEvent((event: ChatEvent) => {
    const sessionId = requestSession.current[event.requestId];
    if (!sessionId) return;
    const eventId =
      event.eventId ??
      (event.data &&
      typeof event.data === "object" &&
      Number.isSafeInteger((event.data as { event_id?: unknown }).event_id)
        ? Number((event.data as { event_id: number }).event_id)
        : undefined);
    if (eventId !== undefined) {
      let seen = seenRunEvents.current[event.requestId];
      if (!seen) {
        seen = new Set();
        seenRunEvents.current[event.requestId] = seen;
      }
      if (seen.has(eventId)) return;
      seen.add(eventId);
      if (seen.size > 200) seen.delete(Math.min(...seen));
      runCursors.current[event.requestId] = eventId;
      saveRunCursors(runCursors.current);
    }
    if (event.event === "agent.run" && isDesktopRunUpdate(event.data)) {
      const update = event.data;
      setRunReceipts((current) => {
        const prior = current[event.requestId];
        const nextKey = runEventKey(update);
        const lastEvent = prior?.events.at(-1);
        const events =
          lastEvent && runEventKey(lastEvent) === nextKey
            ? prior.events
            : [...(prior?.events ?? []), update].slice(-30);
        return {
          ...current,
          [event.requestId]: {
            latest: update,
            events,
          },
        };
      });
      return;
    }
    if (event.event === "response.output_text.delta") {
      const payload =
        event.data && typeof event.data === "object"
          ? (event.data as {
              delta?: unknown;
              response?: unknown;
              part_id?: unknown;
              sequence?: unknown;
            })
          : {};
      const frameKey = streamedResponseFrameKey(payload);
      if (frameKey) {
        let seen = seenStreamParts.current[event.requestId];
        if (!seen) {
          seen = new Set();
          seenStreamParts.current[event.requestId] = seen;
        }
        if (seen.has(frameKey)) return;
        seen.add(frameKey);
        if (seen.size > 500) seen.delete(seen.values().next().value ?? "");
      }
      const prior = pendingDeltas.current[event.requestId];
      pendingDeltas.current[event.requestId] = {
        sessionId,
        delta: prior
          ? {
              ...payload,
              delta: `${String(prior.delta && typeof prior.delta === "object" ? ((prior.delta as { delta?: unknown }).delta ?? "") : "")}${String(payload.delta ?? "")}`,
            }
          : payload,
      };
      if (deltaFrame.current === null) {
        deltaFrame.current = requestAnimationFrame(flushPendingDeltas);
      }
      return;
    }
    if (
      event.event === "agent.progress" ||
      event.event === "response.notice" ||
      event.event === "attachment.warning"
    ) {
      setProgressBySession((current) =>
        setSessionProgress(
          current,
          sessionId,
          eventText(event.data) ||
            (event.event === "attachment.warning"
              ? "Attachment cleanup needs attention. Your response is still running."
              : "Doolittle is working…"),
        ),
      );
      return;
    }
    if (event.event === "response.completed") {
      flushPendingDeltas();
      const response =
        event.data && typeof event.data === "object"
          ? String((event.data as { response?: unknown }).response ?? "")
          : "";
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: completedResponseText(message.content, { response }),
        pending: false,
      }));
      finishRequest(event.requestId);
      return;
    }
    flushPendingDeltas();
    if (
      handleFailedChatTerminalEvent(
        event,
        sessionId,
        updateAssistant,
        finishRequest,
      )
    ) {
      return;
    }
    if (event.event === "cancelled" || event.event === "response.cancelled") {
      flushPendingDeltas();
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content || "Response stopped.",
        pending: false,
      }));
      finishRequest(event.requestId);
    }
  });

  useEffect(() => {
    if (!coordinator) return;
    const unsubscribe = window.doolittle.onChatEvent(handleChatEvent);
    return unsubscribe;
  }, [coordinator]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry nonce deliberately reruns run recovery without changing backend phase.
  useEffect(() => {
    if (!coordinator || backend.phase !== "ready") return;
    setRunHydration("checking");
    let disposed = false;
    void desktopRequest<{ runs?: unknown; updates?: unknown }>(
      "/chat/runs?limit=50&include_updates=true",
      "GET",
    )
      .then((payload) => {
        if (disposed) return;
        if (!Array.isArray(payload.runs)) {
          setRunHydration("unavailable");
          return;
        }
        const persistedUpdates =
          payload.updates &&
          typeof payload.updates === "object" &&
          !Array.isArray(payload.updates)
            ? (payload.updates as Record<string, unknown>)
            : {};
        for (const value of payload.runs) {
          if (!value || typeof value !== "object") continue;
          const run = value as Record<string, unknown>;
          const runId = typeof run.runId === "string" ? run.runId : "";
          const sessionId =
            typeof run.sessionId === "string" ? run.sessionId : "";
          const status = typeof run.status === "string" ? run.status : "";
          const botId =
            typeof run.botId === "string"
              ? run.botId
              : botIdForSession?.(sessionId) || defaultBotId;
          if (run.source !== "desktop") continue;
          if (!runId || !sessionId) continue;
          if (["complete", "cancelled", "error"].includes(status)) {
            const receipt = historicalRunReceipt(run, persistedUpdates[runId]);
            if (!receipt) continue;
            setRunReceipts((current) =>
              current[runId]
                ? current
                : {
                    ...current,
                    [runId]: receipt,
                  },
            );
            continue;
          }
          requestSession.current[runId] = sessionId;
          if (botId) {
            requestBot.current[runId] = botId;
            onBindSessionBot?.(sessionId, botId);
          }
          activeRequestSessionsRef.current[sessionId] = true;
          setActiveRequests((current) =>
            current[sessionId] ? current : { ...current, [sessionId]: runId },
          );
          setMessages((current) => {
            const messages = current[sessionId] ?? [];
            if (messages.some((message) => message.id === `assistant:${runId}`))
              return current;
            return {
              ...current,
              [sessionId]: [
                ...messages,
                {
                  id: `assistant:${runId}`,
                  runId,
                  role: "assistant",
                  content: "",
                  createdAt:
                    typeof run.startedAt === "string"
                      ? run.startedAt
                      : new Date().toISOString(),
                  pending: true,
                },
              ],
            };
          });
          void window.doolittle
            .subscribeChat({
              requestId: runId,
              after: runCursors.current[runId] ?? 0,
              ...(botId ? { botId } : {}),
            } as Parameters<typeof window.doolittle.subscribeChat>[0])
            .catch(() => undefined);
        }
        setRunHydration("ready");
      })
      .catch(() => {
        if (!disposed) setRunHydration("unavailable");
      });
    return () => {
      disposed = true;
    };
  }, [
    backend.phase,
    coordinator,
    setMessages,
    setRunHydration,
    setRunReceipts,
    activeRequestSessionsRef,
    requestSession,
    setActiveRequests,
    runCursors,
    runHydrationRetry,
    botIdForSession,
    defaultBotId,
    onBindSessionBot,
    requestBot,
  ]);

  const sendMessage = async (
    input: string,
    attachments = attachedFiles,
    attachmentCleanup = draftAttachmentCleanup,
    sessionId = selectedId,
    clearComposer = true,
    memoryMatchOverride?: MemoryMatchSnapshot,
    projectIdOverride?: string | null,
    contextCapsule: ChatContextCapsule | null = chatContextCapsule,
    composedContentOverride?: string,
  ) => {
    if (attachmentImportPending) {
      setAttachmentValidationError(
        "Wait for file import to finish before sending this message.",
      );
      return false;
    }
    const visibleContent = chatSubmissionContent(input, attachments.length);
    const content =
      composedContentOverride ??
      composeChatContextMessage(visibleContent, contextCapsule);
    if (
      !content ||
      !sessionId ||
      ["foreign", "unknown"].includes(
        sessionWorkspaceBinding(
          remoteSessions.find((session) => session.sessionId === sessionId),
          projects,
          workspacePath,
          window.doolittle.platform,
        ).kind,
      ) ||
      activeRequestSessionsRef.current[sessionId] ||
      activeRequests[sessionId] ||
      (() => {
        const owner = bots?.find(
          (bot) =>
            bot.id ===
            (botIdForSession?.(sessionId) || defaultBotId || selectedBotId),
        );
        return owner && !["ready", "busy", "waiting"].includes(owner.state);
      })() ||
      backend.phase !== "ready" ||
      runHydration !== "ready"
    ) {
      return false;
    }

    if (isCommandMessage(content) && attachments.length > 0) {
      setQueueAnnouncement(
        "Remove message attachments before running a command.",
      );
      return false;
    }
    const messageAttachments = attachments;
    const memoryMatch =
      memoryMatchOverride ?? freezeMemoryMatchSnapshot(content, memoryMatches);
    const requestProjectId =
      projectIdOverride === undefined
        ? (remoteSessions.find((session) => session.sessionId === sessionId)
            ?.projectId ?? activeProject?.id)
        : (projectIdOverride ?? undefined);
    const requestId = crypto.randomUUID();
    const botId = botIdForSession?.(sessionId) || defaultBotId || selectedBotId;
    if (botId) onBindSessionBot?.(sessionId, botId);
    const createdAt = new Date().toISOString();
    const dispatchedDraft = clearComposer
      ? {
          text: input,
          attachments: messageAttachments,
          attachmentCleanup,
          capsule: contextCapsule,
        }
      : null;
    requestSession.current[requestId] = sessionId;
    if (botId) requestBot.current[requestId] = botId;
    activeRequestSessionsRef.current[sessionId] = true;
    // A user's own dispatch should remain visible even if they were reading history.
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
    setProgressBySession((current) =>
      setSessionProgress(
        current,
        sessionId,
        "Doolittle is considering the request…",
      ),
    );
    setActiveRequests((current) => ({ ...current, [sessionId]: requestId }));
    try {
      await window.doolittle.startChat({
        requestId,
        message: content,
        roomId: sessionId,
        ...(botId ? { botId } : {}),
        workspacePath,
        attachmentIds: messageAttachments.map((attachment) => attachment.id),
        ...(Object.keys(attachmentCleanup).length > 0
          ? { attachmentCleanup }
          : {}),
        ...(requestProjectId ? { projectId: requestProjectId } : {}),
      } as Parameters<typeof window.doolittle.startChat>[0]);
      return true;
    } catch (error) {
      if (!requestSession.current[requestId]) return false;
      updateAssistant(sessionId, requestId, (message) => ({
        ...message,
        content: errorMessage(error),
        pending: false,
        error: true,
      }));
      finishRequest(requestId);
      if (dispatchRecovery) {
        const restored = restoreDraftAfterRejectedDispatch(dispatchRecovery);
        if (!restored && Object.keys(attachmentCleanup).length > 0) {
          void cleanupManagedAttachments(
            messageAttachments.map((attachment) => attachment.id),
            attachmentCleanup,
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
      );
      const fork = response.fork;
      const sourceBotId =
        botIdForSession?.(selectedId) || defaultBotId || selectedBotId;
      if (sourceBotId) onBindSessionBot?.(fork.sessionId, sourceBotId);

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
        const accepted = await sendMessage(
          retryPrompt.content,
          retryPrompt.attachments ?? [],
          {},
          fork.sessionId,
          false,
          retryPrompt.memoryMatch,
          fork.projectId ?? null,
        );
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: sendMessage intentionally consumes the current request state after each queue transition.
  useEffect(() => {
    if (
      !coordinator ||
      runHydration !== "ready" ||
      backend.phase !== "ready" ||
      queuePaused ||
      queuedMessages.length === 0 ||
      queueDispatchRef.current
    ) {
      return;
    }
    const [next] = queuedMessages;
    if (!next) return;
    if (
      activeRequests[next.sessionId] ||
      activeRequestSessionsRef.current[next.sessionId]
    )
      return;
    const workspaceStatus = queuedMessageWorkspaceStatus(
      next,
      workspacePath,
      window.doolittle.platform,
    );
    if (workspaceStatus !== "ready") {
      setQueuePaused(true);
      setQueueAnnouncement(
        workspaceStatus === "different-workspace"
          ? "Queued delivery is paused because this message belongs to a different workspace. Switch back to that workspace before resuming."
          : "Queued delivery is paused because this recovered message is not bound to a workspace. Resume to bind it to the current workspace.",
      );
      return;
    }
    queueDispatchRef.current = next.id;
    const queuedContent = composeQueuedMessage(next);
    void sendMessage(
      next.content,
      next.attachments,
      next.attachmentCleanup ?? {},
      next.sessionId,
      false,
      next.memoryMatch,
      next.projectId ?? null,
      next.capsule ?? null,
      queuedContent,
    )
      .then((accepted) => {
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
      })
      .finally(() => {
        queueDispatchRef.current = null;
      });
  }, [
    activeRequest,
    coordinator,
    runHydration,
    activeRequests,
    backend.phase,
    queuePaused,
    queuedMessages,
    workspacePath,
  ]);

  const queueCurrentDraft = async () => {
    if (runHydration !== "ready" || workspaceBindingBlocked) return;
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
        workspacePath,
        ...(activeProject?.id ? { projectId: activeProject.id } : {}),
        content: visibleContent,
        ...(chatContextCapsule ? { capsule: chatContextCapsule } : {}),
        attachments: attachedFiles,
        ...(Object.keys(draftAttachmentCleanup).length > 0
          ? { attachmentCleanup: draftAttachmentCleanup }
          : {}),
        memoryMatch: freezeMemoryMatchSnapshot(content, memoryMatches),
      },
    ]);
    setQueuePaused(false);
    setQueueAnnouncement("Message added to the queue.");
    setDraft("");
    setDraftAttachments([], {});
    setChatContextCapsule(null);
    composerRef.current?.focus();
  };

  const resumeQueuedMessages = () => {
    const [next] = queuedMessages;
    if (!next) return;
    const workspaceStatus = queuedMessageWorkspaceStatus(
      next,
      workspacePath,
      window.doolittle.platform,
    );
    if (workspaceStatus === "different-workspace") {
      setQueuePaused(true);
      setQueueAnnouncement(
        "This queued message belongs to a different workspace. Switch back to that workspace before resuming.",
      );
      return;
    }
    if (workspaceStatus === "legacy-unbound") {
      setQueuedMessages((current) =>
        current.map((message) =>
          message.id === next.id ? { ...message, workspacePath } : message,
        ),
      );
      setQueueAnnouncement(
        "Recovered message bound to this workspace. It will send when Doolittle is ready.",
      );
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
      await queueCurrentDraft();
      return;
    }
    await sendMessage(draft);
  };

  const createConversation = () => {
    const id = newConversationId();
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

  const pickContextFiles = async () => {
    if (attachmentImportPending) return;
    const sessionId = selectedId;
    const revision = attachmentRevisionRef.current;
    setAttachmentImportPending(true);
    try {
      const result = await window.doolittle.pickChatAttachments();
      if (result.canceled || result.attachments.length === 0) return;
      const cleanupCapability = result.cleanupCapability;
      const isCurrentDraft =
        selectedIdRef.current === sessionId &&
        attachmentRevisionRef.current === revision;
      if (!isCurrentDraft) {
        if (cleanupCapability) {
          await window.doolittle.discardChatAttachments({
            attachmentIds: result.attachments.map(
              (attachment) => attachment.id,
            ),
            cleanupCapability,
          });
        }
        return;
      }
      const next = [...attachedFiles];
      const nextCleanup = { ...draftAttachmentCleanup };
      let totalBytes = next.reduce(
        (sum, attachment) => sum + attachment.sizeBytes,
        0,
      );
      let skipped = 0;
      for (const attachment of result.attachments) {
        if (next.some((entry) => entry.id === attachment.id)) continue;
        if (
          next.length >= MAX_MESSAGE_ATTACHMENTS ||
          totalBytes + attachment.sizeBytes > MAX_MESSAGE_ATTACHMENT_BYTES
        ) {
          skipped += 1;
          continue;
        }
        next.push(attachment);
        totalBytes += attachment.sizeBytes;
        if (cleanupCapability) {
          nextCleanup[attachment.id] = cleanupCapability;
        }
      }
      const acceptedIds = new Set(next.map((attachment) => attachment.id));
      const rejectedIds = result.attachments
        .map((attachment) => attachment.id)
        .filter((id) => !acceptedIds.has(id));
      if (cleanupCapability) {
        if (rejectedIds.length > 0) {
          await window.doolittle.discardChatAttachments({
            attachmentIds: rejectedIds,
            cleanupCapability,
          });
        }
      }
      attachmentRevisionRef.current += 1;
      setDraftAttachments(next, nextCleanup);
      if (skipped > 0) {
        setAttachmentValidationError(
          `Attachment limit reached. Up to ${MAX_MESSAGE_ATTACHMENTS} files and 50 MB total are allowed.`,
        );
      } else {
        setAttachmentValidationError("");
      }
    } catch (error) {
      setAttachmentValidationError(
        `Could not add file context: ${errorMessage(error)}`,
      );
    } finally {
      setAttachmentImportPending(false);
    }
  };

  const importAndTranscribeRecording = useCallback(
    async (
      bytes: Uint8Array,
      mimeType: VoiceRecorderMime,
      name: string,
      signal: AbortSignal,
    ) => {
      if (signal.aborted) {
        throw new DOMException("Voice dictation was cancelled.", "AbortError");
      }
      const attachment = await window.doolittle.importRecordedAudio({
        bytes,
        mimeType,
        name,
      });
      if (signal.aborted) {
        await window.doolittle
          .discardRecordedAudio(attachment.id)
          .catch(() => undefined);
        throw new DOMException("Voice dictation was cancelled.", "AbortError");
      }
      try {
        const result = await desktopRequest<{
          transcription: { transcriptText: string };
        }>(
          "/media/transcribe-attachment",
          "POST",
          {
            attachmentId: attachment.id,
            name,
          },
          signal,
        );
        return { transcriptText: result.transcription.transcriptText };
      } catch (error) {
        await window.doolittle
          .discardRecordedAudio(attachment.id)
          .catch(() => undefined);
        throw error;
      }
    },
    [],
  );

  const insertDictationTranscript = useCallback(
    (transcript: string) => {
      setDraft((current) => {
        const trimmed = current.trimEnd();
        return trimmed ? `${trimmed} ${transcript}` : transcript;
      });
      setCommandMenuDismissed(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [setDraft],
  );

  const removeContextFile = (id: string) => {
    attachmentRevisionRef.current += 1;
    const nextAttachments = attachedFiles.filter((entry) => entry.id !== id);
    const nextCleanup = Object.fromEntries(
      Object.entries(draftAttachmentCleanup).filter(
        ([attachmentId]) => attachmentId !== id,
      ),
    );
    setDraftAttachments(nextAttachments, nextCleanup);
    setAttachmentValidationError("");
    void cleanupManagedAttachments([id], draftAttachmentCleanup).catch(
      (error) => {
        setAttachmentValidationError(
          `Could not remove file context: ${errorMessage(error)}`,
        );
      },
    );
  };

  const removeQueuedMessage = (id: string) => {
    const index = queuedMessages.findIndex((message) => message.id === id);
    if (index < 0) return;
    const removed = queuedMessages[index];
    const remaining = queuedMessages.filter((message) => message.id !== id);
    setQueuedMessages(remaining);
    setQueueAnnouncement(
      `Queued message removed. ${remaining.length} ${
        remaining.length === 1 ? "message remains" : "messages remain"
      }.`,
    );
    void cleanupManagedAttachments(
      removed?.attachments.map((attachment) => attachment.id) ?? [],
      removed?.attachmentCleanup ?? {},
    ).catch(() => undefined);
    requestAnimationFrame(() => {
      const buttons = queueRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-queue-remove]",
      );
      const nextButton = buttons?.[Math.min(index, remaining.length - 1)];
      if (nextButton) nextButton.focus();
      else composerRef.current?.focus();
    });
  };

  const clearQueuedMessages = () => {
    const removed = queuedMessages.filter(
      (message) => message.sessionId === selectedId,
    );
    const count = removed.length;
    if (!count) return;
    setQueuedMessages((current) =>
      current.filter((message) => message.sessionId !== selectedId),
    );
    setQueueAnnouncement(
      `${count} queued ${count === 1 ? "message" : "messages"} cleared.`,
    );
    for (const message of removed) {
      void cleanupManagedAttachments(
        message.attachments.map((attachment) => attachment.id),
        message.attachmentCleanup ?? {},
      ).catch(() => undefined);
    }
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const toggleInspector = () => {
    if (!inspectorVisible) setInspectorTab("details");
    setInspectorVisible((current) => !current);
  };
  const openInspectorTab = (tab: InspectorTab) => {
    setInspectorTab(tab);
    setInspectorVisible(true);
  };

  const runtimeProvider = runtime?.provider ?? "Loading provider";
  const runtimeModel = runtime?.model ?? "Loading model";
  const modelRouteLabel = `${runtimeProvider} · ${runtimeModel}`;
  const attachmentTotalBytes = attachedFiles.reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0,
  );
  const composerValidationError =
    attachmentValidationError ||
    (isCommandMessage(draft.trim()) && attachedFiles.length > 0
      ? "Commands cannot be sent with file context. Remove the attachments or send a normal message."
      : "");
  const canSubmit =
    Boolean(draft.trim() || attachedFiles.length > 0) &&
    backend.phase === "ready" &&
    !workspaceBindingBlocked &&
    botReady &&
    runHydration === "ready" &&
    !attachmentImportPending &&
    !composerValidationError;
  const isNewConversation =
    selectedMessages.length === 0 &&
    (selectedSession?.messageCount ?? 0) === 0 &&
    !activeRequest;
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

  if (coordinator) return null;

  return (
    <div
      className={`${CHAT_WORKSPACE_CLASS} ${
        inspectorVisible ? "inspector-open" : "inspector-closed"
      }${inspectorVisible && isNarrowWorkbench ? " inspector-sheet" : ""}`}
      ref={workspaceRef}
    >
      {chromeHost
        ? createPortal(
            <ChatHeaderChrome
              selectedId={selectedId}
              inspectorVisible={inspectorVisible}
              isNewConversation={isNewConversation}
              mobileConversationsButtonRef={mobileConversationsButtonRef}
              mobileConversationsOpen={mobileConversationsOpen}
              modelRouteLabel={modelRouteLabel}
              onOpenMobileConversations={() => setMobileConversationsOpen(true)}
              onOpenRouteControls={() => setRouteDialogOpen(true)}
              onOpenWorkspace={() => onOpenWorkspaceView("code")}
              onPrepareCompression={() => {
                setDraft((current) =>
                  current.trim() ? current : "/compress ",
                );
                requestAnimationFrame(() => composerRef.current?.focus());
              }}
              onToggleInspector={toggleInspector}
              onOpenInspectorTab={openInspectorTab}
              onTogglePin={() => togglePin(selectedId)}
              onSurfaceChange={onSurfaceChange}
              selectedContextLabel={selectedContextLabel}
              selectedContextPercent={selectedContextPercent}
              selectedContextTone={selectedContextTone}
              selectedMessageCount={selectedMessageCount}
              selectedSession={selectedSession}
              selectedUpdatedAt={selectedUpdatedAt}
              selectedUsageError={selectedUsageError}
              sessionsCount={sessionsCount}
              surface={surface}
              workbenchToggleRef={workbenchToggleRef}
              workspacePath={workspacePath}
            />,
            chromeHost,
          )
        : null}
      <section
        aria-hidden={
          (inspectorVisible && isNarrowWorkbench) || surface !== "conversation"
            ? "true"
            : undefined
        }
        aria-label="Conversation detail"
        className="chat-conversation"
        hidden={surface !== "conversation"}
        id={`chat-context-conversation-${selectedId}`}
        inert={
          (inspectorVisible && isNarrowWorkbench) || surface !== "conversation"
        }
      >
        <ChatTranscript
          activeRequest={activeRequest}
          backendReady={backend.phase === "ready"}
          copyStates={copyStates}
          endRef={endRef}
          forkingMessageId={forkingMessageId}
          historyError={historyError}
          hasEarlierMessages={hasEarlierMessages}
          loadingEarlierHistory={loadingEarlierHistory === selectedId}
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
          onRetryHistory={() => retryHistory(selectedId)}
          onRetryMessage={(message) => void branchMessage(message, "retry")}
          onLoadEarlier={() => loadEarlierHistory(selectedId)}
          onSelectPrompt={setDraft}
          onStopReading={stopSpeaking}
          progress={progress}
          projectName={activeProject?.name}
          runReceipts={runReceipts}
          speakingMessageId={speakingMessageId}
          speechSupported={speechSupported}
        />
        {unreadMessageCount > 0 ? (
          <button
            aria-label={`Jump to latest messages (${unreadMessageCount} new)`}
            className="chat-jump-to-latest"
            onClick={jumpToLatestMessages}
            type="button"
          >
            {unreadMessageCount} new{" "}
            {unreadMessageCount === 1 ? "message" : "messages"}
            <span aria-hidden="true"> · Jump to latest</span>
          </button>
        ) : null}
        {storageWarning ? (
          <div
            aria-live="polite"
            className="chat-storage-warning"
            role="status"
          >
            {storageWarning}
          </div>
        ) : null}
        <div aria-live="polite" className="sr-only" role="status">
          {accessibilityStatus}
        </div>
        <ChatComposer
          approvalsVisible={
            routeActive &&
            visible &&
            surface === "conversation" &&
            !(inspectorVisible && isNarrowWorkbench)
          }
          workspaceNotice={
            <>
              {runHydration !== "ready" ? (
                <div
                  className="flex items-center justify-between gap-2 pb-2 text-[length:var(--text-control)] text-[var(--muted)]"
                  role="status"
                >
                  <span>
                    {runHydration === "checking"
                      ? "Checking active runs before sending…"
                      : "Active run recovery is unavailable. Retry before sending; your draft is retained."}
                  </span>
                  {runHydration === "unavailable" ? (
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setRunHydrationRetry((current) => current + 1)
                      }
                      type="button"
                    >
                      Retry run list
                    </button>
                  ) : null}
                </div>
              ) : null}
              {workspaceBindingBlocked ? (
                <div
                  className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[length:var(--text-control)] text-[var(--text-soft)]"
                  role="status"
                >
                  <span>
                    {foreignProject
                      ? `This session belongs to ${foreignProject.name}. Activate its workspace before sending. Existing runs continue in their original workspace.`
                      : "This session's project workspace binding is unavailable. Choose its repository before sending; its draft and history are retained."}
                  </span>
                  {foreignProject && onActivateSessionProject ? (
                    <button
                      className="secondary-button shrink-0"
                      onClick={() =>
                        onActivateSessionProject(selectedId, foreignProject.id)
                      }
                      type="button"
                    >
                      Activate workspace
                    </button>
                  ) : (
                    <button
                      className="secondary-button shrink-0"
                      onClick={() =>
                        onChooseRepository
                          ? void onChooseRepository(selectedId)
                          : onOpenProjectManager?.()
                      }
                      type="button"
                    >
                      Resolve repository
                    </button>
                  )}
                </div>
              ) : null}
              {!botReady && currentBot ? (
                <div
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--text-soft)]"
                  role="status"
                >
                  <span>
                    {currentBot.name} is {currentBot.state}. Activate it before
                    sending; this draft is retained.
                  </span>
                  {currentBot.state === "stopped" && onActivateBot ? (
                    <button
                      className="secondary-button shrink-0"
                      onClick={() => void onActivateBot(currentBot.id)}
                      type="button"
                    >
                      Activate bot
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          }
          activeProject={activeProject}
          projects={projects}
          onChooseRepository={() => onChooseRepository?.(selectedId)}
          onOpenProjectManager={onOpenProjectManager}
          onSelectProjectForNewChat={onSelectProjectForNewChat}
          isNewConversation={isNewConversation}
          backend={backend}
          runtime={runtime}
          refreshRuntime={refreshRuntime}
          onOpenModelsPage={onOpenModelsPage}
          onOpenProvidersPage={onOpenProvidersPage}
          activeRequest={activeRequest}
          cancellingRequest={cancellingRequest}
          onCancelRequest={(requestId) => void cancelRequest(requestId)}
          canSubmit={canSubmit}
          draft={draft}
          setDraft={setDraft}
          onSubmit={submit}
          composerRef={composerRef}
          queueRef={queueRef}
          queuedMessages={queuedMessages.filter(
            (message) => message.sessionId === selectedId,
          )}
          queuePaused={queuePaused}
          resumeQueuedMessages={resumeQueuedMessages}
          setQueueAnnouncement={setQueueAnnouncement}
          clearQueuedMessages={clearQueuedMessages}
          removeQueuedMessage={removeQueuedMessage}
          attachedFiles={attachedFiles}
          attachmentImporting={attachmentImportPending}
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
          pendingApprovals={pendingApprovals}
          runningTasks={runningTasks}
        />
      </section>
      <section
        aria-hidden={surface !== "history" ? "true" : undefined}
        aria-label="Conversation history"
        className="chat-context-surface"
        hidden={surface !== "history"}
        id={`chat-context-history-${selectedId}`}
        inert={surface !== "history"}
      >
        <SessionsPage
          active={backend.phase === "ready" && surface === "history"}
          embedded
          onNewConversation={() => {
            if (onRequestNewConversation) onRequestNewConversation();
            else createConversation();
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
      </section>
      <section
        aria-hidden={surface !== "media" ? "true" : undefined}
        aria-label="Media tools"
        className="chat-context-surface"
        hidden={surface !== "media"}
        id={`chat-context-media-${selectedId}`}
        inert={surface !== "media"}
      >
        <MediaPage
          active={backend.phase === "ready" && surface === "media"}
          embedded
        />
      </section>
      {mobileConversationsOpen ? (
        <Suspense
          fallback={
            <MobileConversationsDialogFallback
              selectedId={selectedId}
              backdropRef={mobileConversationsBackdropRef}
              dialogRef={mobileConversationsDialogRef}
              onClose={() => setMobileConversationsOpen(false)}
            />
          }
        >
          <MobileConversationsDialog
            activeProjectName={activeProject?.name}
            backdropRef={mobileConversationsBackdropRef}
            dialogRef={mobileConversationsDialogRef}
            onClose={() => setMobileConversationsOpen(false)}
            onNewConversation={() => {
              if (onRequestNewConversation) onRequestNewConversation();
              else createConversation();
              setMobileConversationsOpen(false);
            }}
            onSearchChange={setSessionSearch}
            onSelect={onSelect}
            projectLabels={projectLabels}
            search={sessionSearch}
            selectedId={selectedId}
            sessions={sessions}
          />
        </Suspense>
      ) : null}
      {inspectorVisible ? (
        <div
          {...workbenchAccessibilityProps}
          className="chat-workbench-pane max-[720px]:fixed max-[720px]:inset-0 max-[720px]:z-120 max-[720px]:w-full"
          id={`thread-workbench-${selectedId}`}
          ref={workbenchDialogRef}
        >
          <CompanionInspector
            active={backend.phase === "ready"}
            bot={currentBot}
            contextLabel={selectedContextLabel}
            fullWidth={isNarrowWorkbench}
            messageCount={selectedMessageCount}
            onClose={closeInspector}
            onInsertContext={insertChatContext}
            onOpenFullView={onOpenWorkspaceView}
            onTabChange={setInspectorTab}
            sessionId={selectedId}
            tab={inspectorTab}
            title={selectedSession?.title || "New conversation"}
            workspacePath={workspacePath}
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
    </div>
  );
}
