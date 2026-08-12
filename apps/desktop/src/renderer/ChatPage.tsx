import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import {
  type FormEvent,
  lazy,
  type SetStateAction,
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
  CommandCatalogItem,
  CommandCatalogResponse,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
  SavedProfileRecallResponse,
  SessionForkResponse,
  SessionMessagesResponse,
  SessionSummary,
  SessionUsageSummary,
} from "../shared/contracts";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatTranscript } from "./chat/ChatTranscript";
import {
  type BranchMode,
  type ChatMemoryMatchState,
  type ConversationStore,
  type CopyState,
  type DisplayMessage,
  isDesktopRunUpdate,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
  type Role,
  type RunReceiptStore,
  runEventKey,
} from "./chat/models";
import { useModalFocusBoundary } from "./chat/useModalFocusBoundary";
import type { ChatContextHandoff } from "./chat-context-handoff";
import { commandCompletions } from "./command-completion";
import { visibleAssistantText } from "./components/message-output";
import { RouteControlDialog } from "./components/RouteControlDialog";
import type { ThreadWorkbenchFullView } from "./components/ThreadWorkbenchRail";
import type { VoiceRecorderMime } from "./components/VoiceComposerButton";
import {
  type ContextPressureSnapshot,
  clampContextPercent,
  contextPressureTone,
} from "./context-pressure";
import { newConversationId } from "./conversation-id";
import {
  CONVERSATION_PINS_EVENT,
  loadConversationDrafts,
  loadConversationPins,
  loadConversationQueue,
  loadPromptLibrary,
  type PersistedQueuedMessage,
  type PromptLibraryEntry,
  saveConversationDrafts,
  saveConversationPins,
  saveConversationQueue,
  savePromptLibrary,
} from "./conversation-persistence";
import { desktopRequest, displayTimestamp, errorMessage } from "./lib";
import {
  canRecallSavedProfileMatches,
  freezeMemoryMatchSnapshot,
  type MemoryMatchSnapshot,
  normalizeSavedProfileMatches,
} from "./memory-matches";
import type { ProjectLike, ProjectScope } from "./project-manager/models";

interface SessionForRender extends SessionSummary {
  pinned: boolean;
}

interface SessionUsageResponse {
  usage?: SessionUsageSummary;
}

const STORAGE_KEY = "doolittle.desktop.conversations.v2";
const INSPECTOR_STORAGE_KEY = "doolittle.desktop.chat-inspector-visible.v1";
const MEMORY_MATCH_DEBOUNCE_MS = 380;
const NARROW_WORKBENCH_QUERY = "(max-width: 720px)";
const ThreadWorkbenchRail = lazy(async () => {
  const module = await import("./components/ThreadWorkbenchRail");
  return { default: module.ThreadWorkbenchRail };
});

function loadMessages(): ConversationStore {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, messages]) => Array.isArray(messages)),
    ) as ConversationStore;
  } catch {
    return {};
  }
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
  const initialId = useMemo(
    () => selectedId || newConversationId(),
    [selectedId],
  );
  const [messages, setMessages] = useState<ConversationStore>(() => {
    const stored = loadMessages();
    return Object.hasOwn(stored, initialId)
      ? stored
      : { ...stored, [initialId]: [] };
  });
  const draftSessionId = selectedId || initialId;
  const [conversationDrafts, setConversationDrafts] = useState(() =>
    loadConversationDrafts(localStorage),
  );
  const draft = conversationDrafts[draftSessionId] ?? "";
  const setDraft = useCallback(
    (nextValue: SetStateAction<string>) => {
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? "";
        const next =
          typeof nextValue === "function" ? nextValue(previous) : nextValue;
        if (!next) {
          if (!Object.hasOwn(current, draftSessionId)) return current;
          const updated = { ...current };
          delete updated[draftSessionId];
          return updated;
        }
        return { ...current, [draftSessionId]: next };
      });
    },
    [draftSessionId],
  );
  const [memoryMatches, setMemoryMatches] = useState<ChatMemoryMatchState>({
    query: "",
    matches: [],
    status: "idle",
  });
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState("");
  const [inspectorVisible, setInspectorVisible] = useState(
    loadInspectorVisibility,
  );
  const isNarrowWorkbench = useMediaQuery(NARROW_WORKBENCH_QUERY);
  const [pinnedSessions, setPinnedSessions] = useState(() =>
    loadConversationPins(localStorage),
  );
  const [sessionSearch, setSessionSearch] = useState("");
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
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({});
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [promptLibrary, setPromptLibrary] = useState<PromptLibraryEntry[]>(() =>
    loadPromptLibrary(localStorage),
  );
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptScope, setPromptScope] = useState<"general" | "project">(
    activeProject ? "project" : "general",
  );
  const [editingPromptId, setEditingPromptId] = useState("");
  const [editingPromptTitle, setEditingPromptTitle] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState("");
  const [sessionUsage, setSessionUsage] = useState<
    Record<string, ContextPressureSnapshot>
  >({});
  const [usageLoading, setUsageLoading] = useState("");
  const [usageErrors, setUsageErrors] = useState<Record<string, string>>({});
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [attachmentValidationError, setAttachmentValidationError] =
    useState("");
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [commandSelection, setCommandSelection] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const [commandCatalog, setCommandCatalog] = useState<{
    commands: CommandCatalogItem[];
    error: string;
  }>({ commands: [], error: "" });
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const promptRenameRef = useRef<HTMLInputElement>(null);
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
  const requestSession = useRef<Record<string, string>>({});
  const requestedHistory = useRef(new Set<string>());
  const memoryRecallSequence = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingBranchAttachments = useRef<{
    sessionId: string;
    attachments: ManagedAttachmentDescriptor[];
  } | null>(null);
  const consumedContextHandoffs = useRef(new Set<string>());

  const refreshSessionUsage = useCallback(
    async (sessionId: string) => {
      if (!sessionId || backend.phase !== "ready") return;
      setUsageLoading(sessionId);
      setUsageErrors((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      try {
        const path =
          `/sessions/usage?sessionId=${encodeURIComponent(sessionId)}` as const;
        const response = await desktopRequest<SessionUsageResponse>(path);
        const context = response.usage?.context;
        if (context) {
          setSessionUsage((current) => ({
            ...current,
            [sessionId]: context,
          }));
        }
      } catch (error) {
        setUsageErrors((current) => ({
          ...current,
          [sessionId]: errorMessage(error),
        }));
      } finally {
        setUsageLoading((current) => (current === sessionId ? "" : current));
      }
    },
    [backend.phase],
  );

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
    if (!selectedId) onSelect(initialId);
  }, [initialId, onSelect, selectedId]);

  useEffect(() => {
    void refreshSessionUsage(selectedId);
  }, [refreshSessionUsage, selectedId]);

  useEffect(() => {
    if (backend.phase !== "ready") {
      setCommandCatalog({ commands: [], error: "" });
      return;
    }

    let cancelled = false;
    void desktopRequest<CommandCatalogResponse>("/commands/catalog")
      .then((response) => {
        if (!cancelled) {
          setCommandCatalog({ commands: response.commands, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommandCatalog({
            commands: [],
            error: `Command catalog unavailable: ${errorMessage(error)}`,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backend.phase]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    saveConversationPins(localStorage, pinnedSessions);
  }, [pinnedSessions]);

  useEffect(() => {
    saveConversationDrafts(localStorage, conversationDrafts);
  }, [conversationDrafts]);

  useEffect(() => {
    saveConversationQueue(localStorage, queuedMessages);
  }, [queuedMessages]);

  useEffect(() => {
    savePromptLibrary(localStorage, promptLibrary);
  }, [promptLibrary]);

  useEffect(() => {
    if (!activeProject) setPromptScope("general");
  }, [activeProject]);

  useEffect(() => {
    if (editingPromptId) promptRenameRef.current?.focus();
  }, [editingPromptId]);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      speechUtteranceRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const syncPins = () =>
      setPinnedSessions(loadConversationPins(localStorage));
    window.addEventListener(CONVERSATION_PINS_EVENT, syncPins);
    return () => window.removeEventListener(CONVERSATION_PINS_EVENT, syncPins);
  }, []);

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
    const query = draft.trim();
    const sequence = memoryRecallSequence.current + 1;
    memoryRecallSequence.current = sequence;
    if (
      backend.phase !== "ready" ||
      isCommandMessage(query) ||
      !canRecallSavedProfileMatches(query)
    ) {
      setMemoryMatches({ query: "", matches: [], status: "idle" });
      return;
    }

    const timeout = window.setTimeout(() => {
      setMemoryMatches((current) => ({
        query,
        matches: current.query === query ? current.matches : [],
        status: "loading",
      }));
      const path =
        `/profiles/users/recall?userId=desktop-user&query=${encodeURIComponent(query)}` as const;
      void desktopRequest<SavedProfileRecallResponse>(path)
        .then((response) => {
          if (memoryRecallSequence.current !== sequence) return;
          setMemoryMatches({
            query,
            matches: normalizeSavedProfileMatches(response),
            status: "ready",
          });
        })
        .catch(() => {
          if (memoryRecallSequence.current !== sequence) return;
          setMemoryMatches({ query, matches: [], status: "error" });
        });
    }, MEMORY_MATCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [backend.phase, draft]);

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
    const selectedIsRemote = remoteSessions.some(
      (session) => session.sessionId === selectedId,
    );
    if (!selectedId || selectedIsRemote) {
      return;
    }
    setMessages((current) =>
      Object.hasOwn(current, selectedId)
        ? current
        : { ...current, [selectedId]: [] },
    );
  }, [remoteSessions, selectedId]);

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

  useEffect(() => {
    const remoteSession = remoteSessions.find(
      (session) => session.sessionId === selectedId,
    );
    const selectedRequestIsActive =
      Boolean(activeRequest) &&
      requestSession.current[activeRequest ?? ""] === selectedId;
    if (
      backend.phase !== "ready" ||
      !selectedId ||
      !remoteSession ||
      selectedRequestIsActive
    ) {
      return;
    }
    const historyVersion = [
      selectedId,
      remoteSession.messageCount,
      remoteSession.endedAt ?? "",
    ].join(":");
    if (requestedHistory.current.has(historyVersion)) return;

    requestedHistory.current.add(historyVersion);
    setLoadingHistory(selectedId);
    setHistoryError("");
    const path =
      `/sessions/messages?sessionId=${encodeURIComponent(selectedId)}&limit=500` as const;
    void desktopRequest<SessionMessagesResponse>(path)
      .then((response) => {
        const history = response.messages
          .filter(
            (message) =>
              message.role === "user" || message.role === "assistant",
          )
          .map<DisplayMessage>((message) => ({
            id: message.id,
            role: message.role as Role,
            content: message.text,
            attachments: message.attachments,
            createdAt: message.createdAt,
          }));
        setMessages((current) => ({ ...current, [selectedId]: history }));
      })
      .catch((error) => {
        requestedHistory.current.delete(historyVersion);
        setHistoryError(errorMessage(error));
      })
      .finally(() =>
        setLoadingHistory((current) => (current === selectedId ? "" : current)),
      );
  }, [activeRequest, backend.phase, remoteSessions, selectedId]);

  const sessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    const byId = new Map(
      remoteSessions.map((session) => [session.sessionId, session]),
    );

    for (const [sessionId, localMessages] of Object.entries(messages)) {
      const firstUser = localMessages.find(
        (message) => message.role === "user",
      );
      const last = localMessages.at(-1);
      const remoteSession = byId.get(sessionId);
      byId.set(sessionId, {
        ...remoteSession,
        sessionId,
        title:
          remoteSession?.title ??
          firstUser?.content.slice(0, 52) ??
          "New conversation",
        messageCount: localMessages.length,
        endedAt: last?.createdAt,
        participants: [],
        preview: firstUser ? [firstUser.content] : [],
      });
    }

    return [...byId.values()]
      .filter((session) => {
        if (!query) return true;
        const searchable = [
          session.title ?? "",
          session.sessionId,
          session.preview?.[0] ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      })
      .map((session) => {
        return {
          ...session,
          pinned: Boolean(pinnedSessions[session.sessionId]),
        };
      })
      .sort((left, right) => {
        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1;
        }
        return (right.endedAt ?? "").localeCompare(left.endedAt ?? "");
      }) as SessionForRender[];
  }, [messages, pinnedSessions, remoteSessions, sessionSearch]);

  const selectedMessages = messages[selectedId] ?? [];
  const selectedSession = sessions.find(
    (session) => session.sessionId === selectedId,
  );
  const selectedContext = sessionUsage[selectedId];
  const selectedUsageError = usageErrors[selectedId];
  const selectedUpdatedAt =
    selectedSession?.endedAt ??
    selectedMessages.at(-1)?.createdAt ??
    selectedSession?.startedAt;
  const selectedMessageCount =
    selectedSession?.messageCount ?? selectedMessages.length;
  const selectedContextPercent = selectedContext
    ? clampContextPercent(selectedContext.percent)
    : 0;
  const selectedContextTone = selectedContext
    ? contextPressureTone(selectedContext.usageFraction)
    : "neutral";
  const selectedContextLabel = selectedContext
    ? `${Math.round(selectedContextPercent)}%`
    : selectedUsageError
      ? "—"
      : "0%";
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

  const copyMessage = async (id: string, value: string) => {
    if (!value || !navigator.clipboard?.writeText) {
      setCopyStates((current) => ({ ...current, [id]: "failed" }));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyStates((current) => ({ ...current, [id]: "copied" }));
    } catch {
      setCopyStates((current) => ({ ...current, [id]: "failed" }));
    }
    window.setTimeout(() => {
      setCopyStates((current) => {
        const next = { ...current };
        if (Object.hasOwn(next, id)) {
          delete next[id];
        }
        return next;
      });
    }, 1500);
  };

  const speechSupported =
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const stopSpeaking = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setSpeakingMessageId("");
  }, [speechSupported]);

  const readMessage = useCallback(
    (message: DisplayMessage) => {
      const readableContent =
        message.role === "assistant"
          ? visibleAssistantText(message.content)
          : message.content;
      if (
        !speechSupported ||
        message.role !== "assistant" ||
        message.pending ||
        message.error ||
        !readableContent.trim()
      ) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(readableContent);
      speechUtteranceRef.current = utterance;
      setSpeakingMessageId(message.id);
      const finish = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setSpeakingMessageId("");
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [speechSupported],
  );

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
        setConversationDrafts((current) => ({
          ...current,
          [fork.sessionId]: message.content,
        }));
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

  const togglePin = (sessionId: string) => {
    setPinnedSessions((current) => {
      const next = { ...current };
      if (next[sessionId]) {
        delete next[sessionId];
      } else {
        next[sessionId] = true;
      }
      saveConversationPins(localStorage, next);
      window.dispatchEvent(new Event(CONVERSATION_PINS_EVENT));
      return next;
    });
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
  const commandSuggestions = !commandMenuDismissed
    ? commandCompletions(commandCatalog.commands, draft)
    : [];
  const selectCommandSuggestion = (command: CommandCatalogItem) => {
    if (command.disabledReason) {
      setQueueAnnouncement(command.disabledReason);
      return;
    }
    setDraft(command.command);
    setCommandMenuDismissed(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const attachmentTotalBytes = attachedFiles.reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0,
  );
  const visiblePromptLibrary = promptLibrary.filter((entry) =>
    activeProject && promptScope === "project"
      ? entry.projectId === activeProject.id
      : !entry.projectId,
  );
  const saveCurrentPrompt = () => {
    const content = draft.trim();
    if (!content) {
      setQueueAnnouncement("Write a prompt before saving it.");
      composerRef.current?.focus();
      return;
    }
    const fallbackTitle =
      content.split(/\r?\n/u, 1)[0]?.replace(/\s+/gu, " ").slice(0, 80) ||
      "Saved prompt";
    const title = (promptTitle.trim() || fallbackTitle).slice(0, 80);
    const now = new Date().toISOString();
    setPromptLibrary((current) =>
      [
        {
          id: crypto.randomUUID(),
          title,
          content,
          ...(activeProject && promptScope === "project"
            ? { projectId: activeProject.id }
            : {}),
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ].slice(0, 50),
    );
    setPromptTitle("");
    setQueueAnnouncement(`Saved “${title}” to the prompt library.`);
  };
  const restorePrompt = (entry: PromptLibraryEntry) => {
    setDraft(entry.content);
    setPromptLibraryOpen(false);
    setQueueAnnouncement(`Restored “${entry.title}”.`);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const deletePrompt = (entry: PromptLibraryEntry) => {
    setPromptLibrary((current) =>
      current.filter((candidate) => candidate.id !== entry.id),
    );
    if (editingPromptId === entry.id) {
      setEditingPromptId("");
      setEditingPromptTitle("");
    }
    setQueueAnnouncement(`Deleted “${entry.title}” from the prompt library.`);
  };
  const beginPromptRename = (entry: PromptLibraryEntry) => {
    setEditingPromptId(entry.id);
    setEditingPromptTitle(entry.title);
  };
  const finishPromptRename = () => {
    const title = editingPromptTitle.trim().slice(0, 80);
    if (!editingPromptId || !title) return;
    const now = new Date().toISOString();
    setPromptLibrary((current) =>
      current.map((entry) =>
        entry.id === editingPromptId
          ? { ...entry, title, updatedAt: now }
          : entry,
      ),
    );
    setEditingPromptId("");
    setEditingPromptTitle("");
    setQueueAnnouncement(`Renamed prompt to “${title}”.`);
  };
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
          promptRenameRef={promptRenameRef}
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
          promptLibraryOpen={promptLibraryOpen}
          setPromptLibraryOpen={setPromptLibraryOpen}
          visiblePromptLibrary={visiblePromptLibrary}
          promptScope={promptScope}
          setPromptScope={setPromptScope}
          promptTitle={promptTitle}
          setPromptTitle={setPromptTitle}
          saveCurrentPrompt={saveCurrentPrompt}
          editingPromptId={editingPromptId}
          editingPromptTitle={editingPromptTitle}
          setEditingPromptId={setEditingPromptId}
          setEditingPromptTitle={setEditingPromptTitle}
          finishPromptRename={finishPromptRename}
          restorePrompt={restorePrompt}
          deletePrompt={deletePrompt}
          beginPromptRename={beginPromptRename}
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
        <div className="chat-mobile-conversations-backdrop">
          <button
            aria-label="Close conversations"
            className="chat-mobile-conversations-dismiss"
            onClick={() => setMobileConversationsOpen(false)}
            type="button"
          />
          <div
            aria-label="Conversations"
            aria-modal="true"
            className="chat-mobile-conversations-dialog"
            id="mobile-conversations"
            ref={mobileConversationsDialogRef}
            role="dialog"
          >
            <header>
              <div>
                <span className="eyebrow">
                  {activeProject?.name ?? "Workspace"}
                </span>
                <h2>Conversations</h2>
              </div>
              <button
                aria-label="Close conversations"
                className="icon-button"
                onClick={() => setMobileConversationsOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <input
              aria-label="Search conversations"
              onChange={(event) => setSessionSearch(event.target.value)}
              placeholder="Search conversations"
              type="search"
              value={sessionSearch}
            />
            <div className="chat-mobile-conversations-list">
              {sessions.map((session) => (
                <button
                  aria-current={
                    session.sessionId === selectedId ? "page" : undefined
                  }
                  data-mobile-conversation
                  key={session.sessionId}
                  onClick={() => {
                    onSelect(session.sessionId);
                    setMobileConversationsOpen(false);
                  }}
                  type="button"
                >
                  <strong>{session.title || "Untitled conversation"}</strong>
                  <span>
                    {session.messageCount} messages ·{" "}
                    {displayTimestamp(session.endedAt)}
                    {projectLabels
                      ? ` · ${
                          session.projectId
                            ? (projectLabels[session.projectId] ?? "Project")
                            : "Unscoped"
                        }`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="new-chat-button"
              onClick={() => {
                if (onRequestNewConversation) onRequestNewConversation();
                else createConversation();
                setMobileConversationsOpen(false);
              }}
              type="button"
            >
              <span>＋</span> New conversation
            </button>
          </div>
        </div>
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
