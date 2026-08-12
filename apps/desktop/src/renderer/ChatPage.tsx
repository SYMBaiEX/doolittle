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
  ManagedAttachmentDescriptor,
  RuntimeStatus,
  SessionForkResponse,
  SessionSummary,
} from "../shared/contracts";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatTranscript } from "./chat/ChatTranscript";
import {
  type BranchMode,
  type DisplayMessage,
  isDesktopRunUpdate,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
  type RunReceiptStore,
  runEventKey,
} from "./chat/models";
import { useChatComposerSupport } from "./chat/useChatComposerSupport";
import { useChatConversationState } from "./chat/useChatConversationState";
import { useChatMessageActions } from "./chat/useChatMessageActions";
import { useModalFocusBoundary } from "./chat/useModalFocusBoundary";
import type { ChatContextHandoff } from "./chat-context-handoff";
import { visibleAssistantText } from "./components/message-output";
import { RouteControlDialog } from "./components/RouteControlDialog";
import type { ThreadWorkbenchFullView } from "./components/ThreadWorkbenchRail";
import type { VoiceRecorderMime } from "./components/VoiceComposerButton";
import { newConversationId } from "./conversation-id";
import {
  loadConversationQueue,
  type PersistedQueuedMessage,
  saveConversationQueue,
} from "./conversation-persistence";
import { desktopRequest, displayTimestamp, errorMessage } from "./lib";
import {
  freezeMemoryMatchSnapshot,
  type MemoryMatchSnapshot,
} from "./memory-matches";
import type { ProjectLike, ProjectScope } from "./project-manager/models";

const INSPECTOR_STORAGE_KEY = "doolittle.desktop.chat-inspector-visible.v1";
const NARROW_WORKBENCH_QUERY = "(max-width: 720px)";
const ThreadWorkbenchRail = lazy(async () => {
  const module = await import("./components/ThreadWorkbenchRail");
  return { default: module.ThreadWorkbenchRail };
});
const MobileConversationsDialog = lazy(async () => {
  const module = await import("./chat/MobileConversationsDialog");
  return { default: module.MobileConversationsDialog };
});

function MobileConversationsDialogFallback({
  dialogRef,
  onClose,
}: {
  dialogRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  return (
    <div className="chat-mobile-conversations-backdrop">
      <button
        aria-label="Close conversations"
        className="chat-mobile-conversations-dismiss"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Conversations"
        aria-modal="true"
        className="chat-mobile-conversations-dialog"
        id="mobile-conversations"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div
          aria-live="polite"
          className="chat-mobile-conversations-loading"
          role="status"
        >
          <button
            aria-label="Close conversations"
            className="chat-mobile-conversations-close"
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
}) {
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const requestSession = useRef<Record<string, string>>({});
  const {
    draft,
    historyError,
    loadingHistory,
    selectedMessages,
    selectedSession,
    sessionSearch,
    sessions,
    setDraft,
    setDraftForSession,
    setMessages,
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
  const [progress, setProgress] = useState("");
  const [inspectorVisible, setInspectorVisible] = useState(
    loadInspectorVisibility,
  );
  const isNarrowWorkbench = useMediaQuery(NARROW_WORKBENCH_QUERY);
  const [attachedFiles, setAttachedFiles] = useState<
    ManagedAttachmentDescriptor[]
  >([]);
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
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [attachmentValidationError, setAttachmentValidationError] =
    useState("");
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [commandSelection, setCommandSelection] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mobileConversationsButtonRef = useRef<HTMLButtonElement>(null);
  const workbenchToggleRef = useRef<HTMLButtonElement>(null);
  const mobileConversationsDialogRef = useModalFocusBoundary({
    active: mobileConversationsOpen,
    initialFocusSelector: "[data-mobile-conversation]",
    onClose: () => setMobileConversationsOpen(false),
    restoreFocus: true,
    restoreFocusRef: mobileConversationsButtonRef,
  });
  const workbenchDialogRef = useModalFocusBoundary({
    active: inspectorVisible && isNarrowWorkbench,
    initialFocusSelector: '[aria-label="Close thread workbench"]',
    onClose: () => setInspectorVisible(false),
    restoreFocus: !inspectorVisible,
    restoreFocusRef: workbenchToggleRef,
  });
  const queueRef = useRef<HTMLDivElement>(null);
  const queueDispatchRef = useRef<string | null>(null);
  const pendingBranchAttachments = useRef<{
    sessionId: string;
    attachments: ManagedAttachmentDescriptor[];
  } | null>(null);
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
    if (!latestSelectedMessage) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [latestSelectedMessage]);

  useEffect(() => {
    saveConversationQueue(localStorage, queuedMessages);
  }, [queuedMessages]);

  useEffect(() => {
    localStorage.setItem(
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
    insertChatContext(pendingContextHandoff.text);
    onConsumeContextHandoff(pendingContextHandoff.id);
  }, [
    insertChatContext,
    onConsumeContextHandoff,
    pendingContextHandoff,
    selectedId,
  ]);

  useEffect(() => {
    const pending = pendingBranchAttachments.current;
    if (pending?.sessionId === selectedId) {
      setAttachedFiles(pending.attachments);
      pendingBranchAttachments.current = null;
    } else {
      setAttachedFiles([]);
    }
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

  const updateAssistant = (
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
  };

  const finishRequest = (requestId: string) => {
    const completedSessionId = requestSession.current[requestId];
    setActiveRequest((current) => (current === requestId ? null : current));
    setProgress("");
    delete requestSession.current[requestId];
    refreshRuntime();
    if (completedSessionId) {
      void refreshSessionUsage(completedSessionId);
    }
  };

  const handleChatEvent = useEffectEvent((event: ChatEvent) => {
    const sessionId = requestSession.current[event.requestId];
    if (!sessionId) return;
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
      const delta =
        event.data && typeof event.data === "object"
          ? String((event.data as { delta?: unknown }).delta ?? "")
          : "";
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content + delta,
      }));
      return;
    }
    if (event.event === "agent.progress" || event.event === "response.notice") {
      setProgress(eventText(event.data) || "Doolittle is working…");
      return;
    }
    if (event.event === "response.completed") {
      const response =
        event.data && typeof event.data === "object"
          ? String((event.data as { response?: unknown }).response ?? "")
          : "";
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content || response || "Done.",
        pending: false,
      }));
      finishRequest(event.requestId);
      return;
    }
    if (event.event === "error") {
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content:
          eventText(event.data) || "The response could not be completed.",
        pending: false,
        error: true,
      }));
      finishRequest(event.requestId);
      return;
    }
    if (event.event === "cancelled" || event.event === "response.cancelled") {
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content || "Response stopped.",
        pending: false,
      }));
      finishRequest(event.requestId);
    }
  });

  useEffect(() => window.doolittle.onChatEvent(handleChatEvent), []);

  const sendMessage = async (
    input: string,
    attachments = attachedFiles,
    sessionId = selectedId,
    clearComposer = true,
    memoryMatchOverride?: MemoryMatchSnapshot,
    projectIdOverride?: string | null,
  ) => {
    const content = input.trim();
    if (!content || !sessionId || activeRequest || backend.phase !== "ready") {
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
    requestSession.current[requestId] = sessionId;

    setMessages((current) => ({
      ...current,
      [sessionId]: [
        ...(current[sessionId] ?? []),
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          attachments: messageAttachments,
          createdAt,
          memoryMatch,
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
    if (clearComposer) {
      setDraft("");
      setAttachedFiles([]);
    }
    setProgress("Doolittle is considering the request…");
    setActiveRequest(requestId);
    try {
      await window.doolittle.startChat({
        requestId,
        message: content,
        roomId: sessionId,
        attachmentIds: messageAttachments.map((attachment) => attachment.id),
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
      message.error
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
        setDraftForSession(fork.sessionId, message.content);
        pendingBranchAttachments.current = {
          sessionId: fork.sessionId,
          attachments: message.attachments ?? [],
        };
      }

      await Promise.resolve(refreshRuntime());
      onSelect(fork.sessionId);

      if (mode === "retry" && retryPrompt) {
        const accepted = await sendMessage(
          retryPrompt.content,
          retryPrompt.attachments ?? [],
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
    queueDispatchRef.current = next.id;
    void sendMessage(
      next.content,
      next.attachments,
      next.sessionId,
      false,
      next.memoryMatch,
      next.projectId ?? null,
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
  }, [activeRequest, backend.phase, queuePaused, queuedMessages]);

  const queueCurrentDraft = () => {
    const content = draft.trim();
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
        ...(activeProject?.id ? { projectId: activeProject.id } : {}),
        content,
        attachments: attachedFiles,
        memoryMatch: freezeMemoryMatchSnapshot(content, memoryMatches),
      },
    ]);
    setQueuePaused(false);
    setQueueAnnouncement("Message added to the queue.");
    setDraft("");
    setAttachedFiles([]);
    composerRef.current?.focus();
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (activeRequest) {
      queueCurrentDraft();
      return;
    }
    await sendMessage(draft);
  };

  const createConversation = () => {
    const id = newConversationId();
    setMessages((current) => ({ ...current, [id]: [] }));
    onSelect(id);
  };

  const pickContextFiles = async () => {
    try {
      const result = await window.doolittle.pickChatAttachments();
      if (result.canceled || result.attachments.length === 0) return;
      const next = [...attachedFiles];
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
      }
      setAttachedFiles(next);
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
    }
  };

  const importAndTranscribeRecording = useCallback(
    async (bytes: Uint8Array, mimeType: VoiceRecorderMime, name: string) => {
      const attachment = await window.doolittle.importRecordedAudio({
        bytes,
        mimeType,
        name,
      });
      const result = await desktopRequest<{
        transcription: { transcriptText: string };
      }>("/media/transcribe-attachment", "POST", {
        attachmentId: attachment.id,
        name,
      });
      return { transcriptText: result.transcription.transcriptText };
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
    setAttachedFiles((current) => current.filter((entry) => entry.id !== id));
    setAttachmentValidationError("");
  };

  const removeQueuedMessage = (id: string) => {
    const index = queuedMessages.findIndex((message) => message.id === id);
    if (index < 0) return;
    const remaining = queuedMessages.filter((message) => message.id !== id);
    setQueuedMessages(remaining);
    setQueueAnnouncement(
      `Queued message removed. ${remaining.length} ${
        remaining.length === 1 ? "message remains" : "messages remain"
      }.`,
    );
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
    setQueuedMessages([]);
    setQueuePaused(false);
    setQueueAnnouncement(
      `${count} queued ${count === 1 ? "message" : "messages"} cleared.`,
    );
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
    Boolean(draft.trim()) &&
    backend.phase === "ready" &&
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
      className={`chat-workspace ${
        inspectorVisible ? "inspector-open" : "inspector-closed"
      }`}
    >
      {chromeHost
        ? createPortal(
            <div className="chat-header-content">
              <div className="chat-header-mainline">
                <div className="chat-header-title-wrap">
                  <h2>{selectedSession?.title ?? "New conversation"}</h2>
                </div>
                <div className="chat-session-meta-wrap">
                  <div className="chat-session-meta">
                    {selectedSession?.parentSessionId ? (
                      <span
                        className="chat-session-meta-pill chat-meta-branch"
                        title={`Forked from ${selectedSession.parentSessionId}`}
                      >
                        Branch
                      </span>
                    ) : null}
                    <span className="chat-session-meta-pill chat-meta-count">
                      {selectedMessageCount.toLocaleString()} messages
                    </span>
                    <button
                      className="chat-session-meta-pill chat-meta-workspace"
                      onClick={() => onOpenWorkspaceView("code")}
                      title={
                        workspacePath || "Open the current coding workspace"
                      }
                      type="button"
                    >
                      Code
                    </button>
                    <span className="chat-session-meta-pill chat-meta-updated">
                      {selectedUpdatedAt
                        ? `Updated ${displayTimestamp(selectedUpdatedAt)}`
                        : "Not started"}
                    </span>
                  </div>
                </div>
                <div className="chat-header-top-actions">
                  {selectedContextPercent >= 70 ? (
                    <button
                      aria-label={`${selectedContextLabel} context used. Prepare context compression.`}
                      className={`chat-context-compact context-${selectedContextTone}`}
                      onClick={() => {
                        setDraft((current) =>
                          current.trim() ? current : "/compress ",
                        );
                        requestAnimationFrame(() =>
                          composerRef.current?.focus(),
                        );
                      }}
                      title={`${selectedContextLabel} context used · Compress context`}
                      type="button"
                    >
                      {selectedContextLabel}
                    </button>
                  ) : (
                    <span
                      className={`chat-context-compact context-${selectedContextTone}`}
                      title={
                        selectedUsageError
                          ? "Context usage unavailable"
                          : `${selectedContextLabel} context used`
                      }
                    >
                      {selectedContextLabel}
                    </span>
                  )}
                  <button
                    aria-label={
                      selectedSession?.pinned
                        ? "Unpin conversation"
                        : "Pin conversation"
                    }
                    aria-pressed={Boolean(selectedSession?.pinned)}
                    className={`chat-session-meta-pill chat-meta-pin ${
                      selectedSession?.pinned ? "selected" : ""
                    }`.trim()}
                    onClick={() => togglePin(selectedId)}
                    title={
                      selectedSession?.pinned
                        ? "Unpin conversation"
                        : "Pin conversation"
                    }
                    type="button"
                  >
                    <span aria-hidden="true">
                      {selectedSession?.pinned ? "◆" : "◇"}
                    </span>
                  </button>
                  <button
                    aria-label={`Open route controls. Current route ${modelRouteLabel}.`}
                    className="chat-model-route"
                    onClick={() => setRouteDialogOpen(true)}
                    type="button"
                  >
                    <strong>{modelRouteLabel}</strong>
                  </button>
                  <button
                    aria-controls="mobile-conversations"
                    aria-expanded={mobileConversationsOpen}
                    className="chat-mobile-conversations-button secondary-button"
                    onClick={() => setMobileConversationsOpen(true)}
                    ref={mobileConversationsButtonRef}
                    type="button"
                  >
                    <span>History</span>
                    <small>{sessions.length}</small>
                  </button>
                  {activeRequest ? (
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void window.doolittle.cancelChat(activeRequest)
                      }
                      type="button"
                    >
                      Stop response
                    </button>
                  ) : null}
                  <button
                    aria-controls="thread-workbench"
                    aria-expanded={inspectorVisible}
                    className={`secondary-button chat-workbench-toggle ${
                      inspectorVisible ? "selected" : ""
                    }`}
                    onClick={toggleInspector}
                    ref={workbenchToggleRef}
                    type="button"
                  >
                    <span aria-hidden="true">◧</span>
                    Workbench
                  </button>
                </div>
              </div>
            </div>,
            chromeHost,
          )
        : null}
      <section
        aria-hidden={inspectorVisible && isNarrowWorkbench ? "true" : undefined}
        aria-label="Conversation detail"
        className="chat-conversation"
        inert={inspectorVisible && isNarrowWorkbench}
      >
        <ChatTranscript
          activeRequest={activeRequest}
          backendReady={backend.phase === "ready"}
          copyStates={copyStates}
          endRef={endRef}
          forkingMessageId={forkingMessageId}
          historyError={historyError}
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
          onSelectPrompt={setDraft}
          onStopReading={stopSpeaking}
          progress={progress}
          projectName={activeProject?.name}
          runReceipts={runReceipts}
          speakingMessageId={speakingMessageId}
          speechSupported={speechSupported}
        />
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
          canSubmit={canSubmit}
          draft={draft}
          setDraft={setDraft}
          onSubmit={submit}
          composerRef={composerRef}
          queueRef={queueRef}
          queuedMessages={queuedMessages}
          queuePaused={queuePaused}
          setQueuePaused={setQueuePaused}
          setQueueAnnouncement={setQueueAnnouncement}
          clearQueuedMessages={clearQueuedMessages}
          removeQueuedMessage={removeQueuedMessage}
          attachedFiles={attachedFiles}
          attachmentTotalBytes={attachmentTotalBytes}
          removeContextFile={removeContextFile}
          composerValidationError={composerValidationError}
          memoryMatches={memoryMatches}
          commandSuggestions={commandSuggestions}
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
      {mobileConversationsOpen ? (
        <Suspense
          fallback={
            <MobileConversationsDialogFallback
              dialogRef={mobileConversationsDialogRef}
              onClose={() => setMobileConversationsOpen(false)}
            />
          }
        >
          <MobileConversationsDialog
            activeProjectName={activeProject?.name}
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
          className="chat-workbench-pane"
          id="thread-workbench"
          ref={workbenchDialogRef}
        >
          <Suspense
            fallback={
              <div
                aria-label="Loading thread workbench"
                className="thread-workbench"
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
