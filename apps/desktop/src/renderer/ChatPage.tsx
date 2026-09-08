import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import {
  type FormEvent,
  lazy,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
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
const ThreadWorkbenchRail = lazy(async () => {
  const module = await import("./components/ThreadWorkbenchRail");
  return { default: module.ThreadWorkbenchRail };
});
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
  backdropRef,
  dialogRef,
  onClose,
}: {
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
        id="mobile-conversations"
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
export function ChatPage({
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
  pendingApprovals,
  pendingContextHandoff,
  runningTasks,
  chromeHost,
  surface = "conversation",
  onSurfaceChange,
}: {
  backend: BackendState;
  runtime: RuntimeStatus | null;
  remoteSessions: SessionSummary[];
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
  onChooseRepository?: () => void | Promise<void>;
  onOpenProjectManager?: () => void;
  onSelectProjectForNewChat?: (scope: ProjectScope) => void;
  onRequestNewConversation?: () => void;
  pendingApprovals: number;
  pendingContextHandoff: ChatContextHandoff | null;
  runningTasks: number;
  chromeHost: HTMLElement | null;
  surface?: ChatSurface;
  onSurfaceChange?: (surface: ChatSurface) => void;
}) {
  const [activeRequests, setActiveRequests] = useState<Record<string, string>>(
    {},
  );
  const activeRequestSessionsRef = useRef<Record<string, true>>({});
  const requestSession = useRef<Record<string, string>>({});
  const activeRequest = activeRequests[selectedId] ?? null;
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
    backendReady: backend.phase === "ready",
    onSelect,
    remoteSessions,
    requestSession,
    selectedId,
  });
  const latestSelectedMessage = selectedMessages.at(-1);
  const [progressBySession, setProgressBySession] = useState<
    Record<string, string>
  >({});
  const progress = progressBySession[selectedId] ?? "";
  const [inspectorVisible, setInspectorVisible] = useState(
    loadInspectorVisibility,
  );
  const isNarrowWorkbench = useMediaQuery(NARROW_WORKBENCH_QUERY);
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const attachedFiles = draftAttachments;
  const recoveredQueue = useMemo(() => loadConversationQueue(localStorage), []);
  const [queuedMessages, setQueuedMessages] =
    useState<PersistedQueuedMessage[]>(recoveredQueue);
  const [queuePaused, setQueuePaused] = useState(recoveredQueue.length > 0);
  const [queueAnnouncement, setQueueAnnouncement] = useState(
    recoveredQueue.length > 0
      ? `${recoveredQueue.length} queued ${
          recoveredQueue.length === 1 ? "message was" : "messages were"
        } recovered. Review and resume when ready.`
      : "",
  );
  const [runReceipts, setRunReceipts] = useState<RunReceiptStore>({});
  const [cancellingRequest, setCancellingRequest] = useState<string | null>(
    null,
  );
  const runCursors = useRef<Record<string, number>>(loadRunCursors());
  const seenRunEvents = useRef<Record<string, Set<number>>>({});
  const seenStreamParts = useRef<Record<string, Set<string>>>({});
  const cancellationTimers = useRef<Record<string, number>>({});
  const pendingDeltas = useRef<
    Record<string, { sessionId: string; delta: unknown }>
  >({});
  const deltaFrame = useRef<number | null>(null);
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [attachmentValidationError, setAttachmentValidationError] =
    useState("");
  const [attachmentImportPending, setAttachmentImportPending] = useState(false);
  const attachmentRevisionRef = useRef(0);
  const [unreadMessageIdsBySession, setUnreadMessageIdsBySession] = useState<
    Record<string, string[]>
  >({});
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [commandSelection, setCommandSelection] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const transcriptFollowRef = useRef(true);
  const forceTranscriptFollowRef = useRef(false);
  const scheduledForceTranscriptFollowRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  // A dialog can settle between this render and the selected-session effect.
  selectedIdRef.current = selectedId;
  const knownMessageIdsBySession = useRef<Record<string, string[]>>({});
  const scheduleTranscriptScrollRef = useRef<(() => void) | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mobileConversationsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileConversationsBackdropRef = useRef<HTMLDivElement>(null);
  const workbenchToggleRef = useRef<HTMLButtonElement>(null);
  const mobileConversationsDialogRef = useModalFocusBoundary({
    active: mobileConversationsOpen,
    initialFocusSelector: "[data-mobile-conversations-search]",
    isolationBoundaryRef: mobileConversationsBackdropRef,
    isolateBackground: true,
    onClose: () => setMobileConversationsOpen(false),
    restoreFocus: true,
    restoreFocusRef: mobileConversationsButtonRef,
  });
  const workbenchDialogRef = useModalFocusBoundary({
    active: inspectorVisible && isNarrowWorkbench,
    initialFocusSelector: '[aria-label="Close thread context"]',
    isolateBackground: true,
    onClose: () => setInspectorVisible(false),
    restoreFocus: !inspectorVisible,
    restoreFocusRef: workbenchToggleRef,
  });
  const queueRef = useRef<HTMLDivElement>(null);
  const queueDispatchRef = useRef<string | null>(null);
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
    backendReady: backend.phase === "ready",
    commandMenuDismissed,
    composerRef,
    draft,
    selectedId,
    setCommandMenuDismissed,
    setDraft,
    setQueueAnnouncement,
    workspacePath,
  });
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
    const container = endRef.current?.parentElement;
    if (!container) return;
    transcriptFollowRef.current = isChatNearBottom(container);
    const handleScroll = () => {
      transcriptFollowRef.current = isChatNearBottom(container);
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
  }, [selectedId]);

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
  }, [queueAnnouncement]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (
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
    onConsumeContextHandoff,
    pendingContextHandoff,
    selectedId,
    setChatContextCapsule,
  ]);

  useEffect(() => {
    if (previousSelectedId.current === selectedId) return;
    previousSelectedId.current = selectedId;
    setAttachmentValidationError("");
  }, [selectedId]);

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
  }, [updateAssistant]);

  const finishRequest = (requestId: string) => {
    const cancellationTimer = cancellationTimers.current[requestId];
    if (cancellationTimer !== undefined) {
      window.clearTimeout(cancellationTimer);
      delete cancellationTimers.current[requestId];
    }
    setCancellingRequest((current) => (current === requestId ? null : current));
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
    if (cancellingRequest === requestId) return;
    setCancellingRequest(requestId);
    setQueueAnnouncement("Stopping the current response…");
    try {
      await window.doolittle.cancelChat(requestId);
      if (requestSession.current[requestId]) {
        cancellationTimers.current[requestId] = window.setTimeout(() => {
          delete cancellationTimers.current[requestId];
          setCancellingRequest((current) =>
            current === requestId ? null : current,
          );
          setQueueAnnouncement(
            "Stopping is taking longer than expected. You can try stopping again while the runtime reconnects.",
          );
        }, 8_000);
      }
    } catch (error) {
      setCancellingRequest((current) =>
        current === requestId ? null : current,
      );
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
    const unsubscribe = window.doolittle.onChatEvent(handleChatEvent);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (backend.phase !== "ready") return;
    let disposed = false;
    void desktopRequest<{ runs?: unknown; updates?: unknown }>(
      "/chat/runs?limit=50&include_updates=true",
      "GET",
    )
      .then((payload) => {
        if (disposed || !Array.isArray(payload.runs)) return;
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
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [backend.phase, setMessages]);

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
      activeRequestSessionsRef.current[sessionId] ||
      activeRequests[sessionId] ||
      backend.phase !== "ready"
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
        ? activeProject?.id
        : (projectIdOverride ?? undefined);
    const requestId = crypto.randomUUID();
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
    activeRequestSessionsRef.current[sessionId] = true;
    // A user's own dispatch should remain visible even if they were reading history.
    forceTranscriptFollowRef.current = true;
    setMessages((current) => ({
      ...current,
      [sessionId]: [
        ...(current[sessionId] ?? []),
        {
          id: crypto.randomUUID(),
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
      activeRequest ||
      backend.phase !== "ready" ||
      queuePaused ||
      queuedMessages.length === 0 ||
      queueDispatchRef.current
    ) {
      return;
    }
    const [next] = queuedMessages;
    if (!next) return;
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
    activeRequests,
    backend.phase,
    queuePaused,
    queuedMessages,
    workspacePath,
  ]);

  const queueCurrentDraft = async () => {
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
    const count = queuedMessages.length;
    if (!count) return;
    const removed = [...queuedMessages];
    setQueuedMessages([]);
    setQueuePaused(false);
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
    setInspectorVisible((current) => !current);
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
    !attachmentImportPending &&
    !composerValidationError;
  const isNewConversation =
    selectedMessages.length === 0 &&
    (selectedSession?.messageCount ?? 0) === 0 &&
    !activeRequest;
  const workbenchAccessibilityProps = isNarrowWorkbench
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

  return (
    <div
      className={`${CHAT_WORKSPACE_CLASS} ${
        inspectorVisible ? "inspector-open" : "inspector-closed"
      }`}
    >
      {chromeHost
        ? createPortal(
            <ChatHeaderChrome
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
        id="chat-context-conversation"
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
          activeProject={activeProject}
          projects={projects}
          onChooseRepository={onChooseRepository}
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
          queuedMessages={queuedMessages}
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
        id="chat-context-history"
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
        id="chat-context-media"
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
          id="thread-workbench"
          ref={workbenchDialogRef}
        >
          <Suspense
            fallback={
              <div
                aria-label="Loading thread workbench"
                className="grid h-full min-h-0 w-[var(--thread-workbench-width,420px)] max-w-[48vw] place-items-center overflow-hidden border-[var(--border)] border-l bg-[var(--surface)] text-[var(--muted)] max-[720px]:w-full max-[720px]:max-w-none"
                role="status"
              />
            }
          >
            <ThreadWorkbenchRail
              active={backend.phase === "ready"}
              onInsertContext={insertChatContext}
              onOpenFullView={onOpenWorkspaceView}
              onRequestClose={() => setInspectorVisible(false)}
              sessionId={selectedId}
              workspacePath={workspacePath}
            />
          </Suspense>
        </div>
      ) : null}
      <RouteControlDialog
        isOpen={routeDialogOpen}
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
