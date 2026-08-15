import {
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ManagedAttachmentDescriptor,
  SessionMessagesResponse,
  SessionSummary,
} from "../../shared/contracts";
import {
  type ChatContextCapsule,
  splitChatContext,
} from "../chat-context-handoff";
import { newConversationId } from "../conversation-id";
import {
  CONVERSATION_PINS_EVENT,
  type ConversationDraft,
  loadConversationDrafts,
  loadConversationPins,
  type StorageLike,
  safeSetStorageItem,
  saveConversationDrafts,
  saveConversationPins,
} from "../conversation-persistence";
import { desktopRequest, errorMessage } from "../lib";
import {
  canRestoreRejectedDispatch,
  type DraftDispatchRecovery,
} from "./draft-dispatch-recovery";
import type {
  ChatContextMessageCapsule,
  ConversationStore,
  DisplayMessage,
  Role,
} from "./models";

const CHAT_STORAGE_KEY = "doolittle.desktop.conversations.v2";
const MAX_CHAT_STORAGE_CHARS = 3_500_000;
const MAX_PERSISTED_MESSAGES_PER_SESSION = 500;
const MAX_PERSISTED_MESSAGE_CONTENT = 120_000;

function boundedStoredMessages(
  messages: readonly DisplayMessage[],
  maxMessages: number,
  maxContent: number,
): DisplayMessage[] {
  return messages.slice(-maxMessages).map((message) =>
    message.content.length <= maxContent
      ? message
      : {
          ...message,
          content: `${message.content.slice(0, maxContent)}\n\n[Local transcript cache truncated]`,
        },
  );
}

/** Persist chat history as a bounded, best-effort cache; the server remains canonical. */
export function saveStoredChatMessages(
  storage: StorageLike,
  messages: ConversationStore,
  protectedSessionId?: string,
): boolean {
  try {
    const entries = Object.entries(messages).sort(([, left], [, right]) =>
      (right.at(-1)?.createdAt ?? "").localeCompare(
        left.at(-1)?.createdAt ?? "",
      ),
    );
    const ordered = protectedSessionId
      ? [
          ...entries.filter(([sessionId]) => sessionId === protectedSessionId),
          ...entries.filter(([sessionId]) => sessionId !== protectedSessionId),
        ]
      : entries;
    const persisted: ConversationStore = {};
    for (const [sessionId, sessionMessages] of ordered) {
      const bounded = boundedStoredMessages(
        sessionMessages,
        MAX_PERSISTED_MESSAGES_PER_SESSION,
        MAX_PERSISTED_MESSAGE_CONTENT,
      );
      const candidate = JSON.stringify({
        ...persisted,
        [sessionId]: bounded,
      });
      if (candidate.length <= MAX_CHAT_STORAGE_CHARS) {
        persisted[sessionId] = bounded;
        continue;
      }
      if (sessionId === protectedSessionId) {
        const compact = boundedStoredMessages(sessionMessages, 50, 32_000);
        const compactCandidate = JSON.stringify({
          ...persisted,
          [sessionId]: compact,
        });
        if (compactCandidate.length <= MAX_CHAT_STORAGE_CHARS) {
          persisted[sessionId] = compact;
        }
      }
    }
    return safeSetStorageItem(
      storage,
      CHAT_STORAGE_KEY,
      JSON.stringify(persisted),
    );
  } catch {
    return false;
  }
}

function isStoredDisplayMessage(value: unknown): value is DisplayMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const message = value as Partial<DisplayMessage>;
  const capsule = message.contextCapsule;
  const validCapsule =
    capsule === undefined ||
    (Boolean(capsule) &&
      typeof capsule === "object" &&
      (capsule.kind === "file" ||
        capsule.kind === "diff" ||
        capsule.kind === "review" ||
        capsule.kind === "brief" ||
        capsule.kind === "terminal" ||
        capsule.kind === "plan" ||
        capsule.kind === "browser") &&
      typeof capsule.path === "string" &&
      (capsule.source === undefined || typeof capsule.source === "string"));
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "string" &&
    validCapsule
  );
}

function toMessageCapsule(
  capsule: ReturnType<typeof splitChatContext>["capsule"],
): ChatContextMessageCapsule | undefined {
  if (!capsule) return undefined;
  return {
    kind: capsule.kind,
    path: capsule.path,
    ...(capsule.source ? { source: capsule.source } : {}),
  };
}

export interface ChatSessionForRender extends SessionSummary {
  pinned: boolean;
}

export function loadStoredChatMessages(
  storage: StorageLike,
): ConversationStore {
  try {
    const value = storage.getItem(CHAT_STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([sessionId, messages]) => [
        sessionId,
        Array.isArray(messages) ? messages.filter(isStoredDisplayMessage) : [],
      ]),
    ) as ConversationStore;
  } catch {
    return {};
  }
}

/**
 * Local assistant placeholders only represent an in-flight IPC request. Once
 * history has hydrated after a reload, an unclaimed placeholder must not stay
 * in the transcript as an empty, permanently-working response.
 */
export function reconcileOrphanedPendingMessages(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
  activeRequestIds: ReadonlySet<string>,
): DisplayMessage[] {
  const hasRemoteAssistant = history.some(
    (message) => message.role === "assistant",
  );
  return localMessages.flatMap((message) => {
    if (
      message.role !== "assistant" ||
      !message.pending ||
      !message.id.startsWith("assistant:")
    ) {
      return [message];
    }
    const requestId = message.id.slice("assistant:".length);
    if (activeRequestIds.has(requestId)) return [message];
    // A real remote assistant row supersedes the synthetic placeholder.
    if (hasRemoteAssistant) return [];
    return [
      {
        ...message,
        content:
          "This response was interrupted before it finished. Retry it to continue.",
        pending: false,
        error: true,
      },
    ];
  });
}

export function projectChatSessions({
  messages,
  pinnedSessions,
  query,
  remoteSessions,
}: {
  messages: ConversationStore;
  pinnedSessions: Readonly<Record<string, boolean>>;
  query: string;
  remoteSessions: readonly SessionSummary[];
}): ChatSessionForRender[] {
  const normalizedQuery = query.trim().toLowerCase();
  const byId = new Map(
    remoteSessions.map((session) => [session.sessionId, session]),
  );

  for (const [sessionId, localMessages] of Object.entries(messages)) {
    const firstUser = localMessages.find((message) => message.role === "user");
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
      if (!normalizedQuery) return true;
      return [
        session.title ?? "",
        session.sessionId,
        session.preview?.[0] ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .map((session) => ({
      ...session,
      pinned: Boolean(pinnedSessions[session.sessionId]),
    }))
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return (right.endedAt ?? "").localeCompare(left.endedAt ?? "");
    });
}

export function useChatConversationState({
  activeRequest,
  backendReady,
  onSelect,
  remoteSessions,
  requestSession,
  selectedId,
}: {
  activeRequest: string | null;
  backendReady: boolean;
  onSelect: (sessionId: string) => void;
  remoteSessions: readonly SessionSummary[];
  requestSession: MutableRefObject<Record<string, string>>;
  selectedId: string;
}) {
  const initialId = useMemo(
    () => selectedId || newConversationId(),
    [selectedId],
  );
  const [messages, setMessages] = useState<ConversationStore>(() => {
    const stored = loadStoredChatMessages(localStorage);
    return Object.hasOwn(stored, initialId)
      ? stored
      : { ...stored, [initialId]: [] };
  });
  const draftSessionId = selectedId || initialId;
  const [conversationDrafts, setConversationDrafts] = useState(() =>
    loadConversationDrafts(localStorage),
  );
  const [pinnedSessions, setPinnedSessions] = useState(() =>
    loadConversationPins(localStorage),
  );
  const [sessionSearch, setSessionSearch] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [transcriptStorageWarning, setTranscriptStorageWarning] = useState("");
  const [draftStorageWarning, setDraftStorageWarning] = useState("");
  const [loadingHistory, setLoadingHistory] = useState("");
  const [historyRetryVersion, setHistoryRetryVersion] = useState(0);
  const requestedHistory = useRef(new Set<string>());
  const draftRevisions = useRef<Record<string, number>>({});

  const bumpDraftRevision = useCallback((sessionId: string) => {
    const revision = (draftRevisions.current[sessionId] ?? 0) + 1;
    draftRevisions.current[sessionId] = revision;
    return revision;
  }, []);

  const draftState = conversationDrafts[draftSessionId] ?? {
    text: "",
    capsule: null,
    attachments: [],
  };
  const draft = draftState.text;
  const chatContextCapsule = draftState.capsule;
  const draftAttachments = draftState.attachments;
  const setDraft = useCallback(
    (nextValue: SetStateAction<string>) => {
      bumpDraftRevision(draftSessionId);
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? {
          text: "",
          capsule: null,
          attachments: [],
        };
        const next =
          typeof nextValue === "function"
            ? nextValue(previous.text)
            : nextValue;
        if (!next && !previous.capsule && previous.attachments.length === 0) {
          if (!Object.hasOwn(current, draftSessionId)) return current;
          const updated = { ...current };
          delete updated[draftSessionId];
          return updated;
        }
        return {
          ...current,
          [draftSessionId]: { ...previous, text: next },
        };
      });
    },
    [bumpDraftRevision, draftSessionId],
  );

  const setDraftForSession = useCallback(
    (
      sessionId: string,
      value: string,
      attachments: ManagedAttachmentDescriptor[] = [],
    ) => {
      bumpDraftRevision(sessionId);
      setConversationDrafts((current) => ({
        ...current,
        [sessionId]: { text: value, capsule: null, attachments },
      }));
    },
    [bumpDraftRevision],
  );

  const setChatContextCapsule = useCallback(
    (capsule: ChatContextCapsule | null) => {
      bumpDraftRevision(draftSessionId);
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? {
          text: "",
          capsule: null,
          attachments: [],
        };
        if (!previous.text && !capsule && previous.attachments.length === 0) {
          if (!Object.hasOwn(current, draftSessionId)) return current;
          const updated = { ...current };
          delete updated[draftSessionId];
          return updated;
        }
        return {
          ...current,
          [draftSessionId]: { ...previous, capsule },
        };
      });
    },
    [bumpDraftRevision, draftSessionId],
  );

  const setDraftAttachments = useCallback(
    (attachments: ManagedAttachmentDescriptor[]) => {
      bumpDraftRevision(draftSessionId);
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? {
          text: "",
          capsule: null,
          attachments: [],
        };
        if (!previous.text && !previous.capsule && attachments.length === 0) {
          if (!Object.hasOwn(current, draftSessionId)) return current;
          const updated = { ...current };
          delete updated[draftSessionId];
          return updated;
        }
        return {
          ...current,
          [draftSessionId]: { ...previous, attachments },
        };
      });
    },
    [bumpDraftRevision, draftSessionId],
  );

  const clearDraftForDispatch = useCallback(
    (sessionId: string) => {
      const revision = bumpDraftRevision(sessionId);
      setConversationDrafts((current) => {
        if (!Object.hasOwn(current, sessionId)) return current;
        const updated = { ...current };
        delete updated[sessionId];
        return updated;
      });
      return revision;
    },
    [bumpDraftRevision],
  );

  const restoreDraftAfterRejectedDispatch = useCallback(
    (recovery: DraftDispatchRecovery) => {
      if (
        !canRestoreRejectedDispatch(
          recovery,
          draftRevisions.current[recovery.sessionId] ?? 0,
        )
      ) {
        return false;
      }
      bumpDraftRevision(recovery.sessionId);
      setConversationDrafts((current) => ({
        ...current,
        [recovery.sessionId]: recovery.draft satisfies ConversationDraft,
      }));
      return true;
    },
    [bumpDraftRevision],
  );

  const togglePin = useCallback((sessionId: string) => {
    setPinnedSessions((current) => {
      const next = { ...current };
      if (next[sessionId]) delete next[sessionId];
      else next[sessionId] = true;
      saveConversationPins(localStorage, next);
      window.dispatchEvent(new Event(CONVERSATION_PINS_EVENT));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedId) onSelect(initialId);
  }, [initialId, onSelect, selectedId]);

  useEffect(() => {
    const persisted = saveStoredChatMessages(
      localStorage,
      messages,
      selectedId,
    );
    setTranscriptStorageWarning(
      persisted
        ? ""
        : "Local transcript cache is unavailable. Your conversation remains active, and server history is unaffected.",
    );
  }, [messages, selectedId]);

  useEffect(() => {
    saveConversationPins(localStorage, pinnedSessions);
  }, [pinnedSessions]);

  useEffect(() => {
    const persisted = saveConversationDrafts(localStorage, conversationDrafts);
    setDraftStorageWarning(
      persisted
        ? ""
        : "Local draft cache is unavailable. Your unsent draft remains active, and server history is unaffected.",
    );
  }, [conversationDrafts]);

  const storageWarning = [transcriptStorageWarning, draftStorageWarning]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const syncPins = () =>
      setPinnedSessions(loadConversationPins(localStorage));
    window.addEventListener(CONVERSATION_PINS_EVENT, syncPins);
    return () => window.removeEventListener(CONVERSATION_PINS_EVENT, syncPins);
  }, []);

  useEffect(() => {
    const selectedIsRemote = remoteSessions.some(
      (session) => session.sessionId === selectedId,
    );
    if (!selectedId || selectedIsRemote) return;
    setMessages((current) =>
      Object.hasOwn(current, selectedId)
        ? current
        : { ...current, [selectedId]: [] },
    );
  }, [remoteSessions, selectedId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry nonce intentionally re-runs the same history request after an error.
  useEffect(() => {
    const remoteSession = remoteSessions.find(
      (session) => session.sessionId === selectedId,
    );
    const selectedRequestIsActive =
      Boolean(activeRequest) &&
      requestSession.current[activeRequest ?? ""] === selectedId;
    if (
      !backendReady ||
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
    const controller = new AbortController();
    let cancelled = false;
    let settled = false;
    const path =
      `/sessions/messages?sessionId=${encodeURIComponent(selectedId)}&limit=500` as const;
    void desktopRequest<SessionMessagesResponse>(
      path,
      "GET",
      undefined,
      controller.signal,
    )
      .then((response) => {
        if (cancelled || controller.signal.aborted) return;
        settled = true;
        const history = response.messages
          .filter(
            (message) =>
              message.role === "user" || message.role === "assistant",
          )
          .map<DisplayMessage>((message) => {
            const handoff =
              message.role === "user" ? splitChatContext(message.text) : null;
            return {
              id: message.id,
              role: message.role as Role,
              content: handoff?.prompt ?? message.text,
              attachments: message.attachments,
              createdAt: message.createdAt,
              ...(handoff?.capsule
                ? { contextCapsule: toMessageCapsule(handoff.capsule) }
                : {}),
            };
          });
        setMessages((current) => {
          const currentMessages = current[selectedId] ?? [];
          const historyIds = new Set(history.map((message) => message.id));
          const localOnly = currentMessages.filter(
            (message) => !historyIds.has(message.id),
          );
          const activeRequestIds = new Set(
            Object.entries(requestSession.current)
              .filter(([, sessionId]) => sessionId === selectedId)
              .map(([requestId]) => requestId),
          );
          return {
            ...current,
            [selectedId]: [
              ...history,
              ...reconcileOrphanedPendingMessages(
                localOnly,
                history,
                activeRequestIds,
              ),
            ].sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt),
            ),
          };
        });
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        settled = true;
        requestedHistory.current.delete(historyVersion);
        setHistoryError(errorMessage(error));
      })
      .finally(() =>
        setLoadingHistory((current) => (current === selectedId ? "" : current)),
      );

    return () => {
      cancelled = true;
      controller.abort();
      if (!settled) requestedHistory.current.delete(historyVersion);
    };
  }, [
    activeRequest,
    backendReady,
    historyRetryVersion,
    remoteSessions,
    requestSession,
    selectedId,
  ]);

  const retryHistory = useCallback(
    (sessionId: string) => {
      if (loadingHistory === sessionId) return;
      const session = remoteSessions.find(
        (entry) => entry.sessionId === sessionId,
      );
      if (!session) return;
      const historyVersion = [
        sessionId,
        session.messageCount,
        session.endedAt ?? "",
      ].join(":");
      requestedHistory.current.delete(historyVersion);
      setHistoryError("");
      setHistoryRetryVersion((current) => current + 1);
    },
    [loadingHistory, remoteSessions],
  );

  const sessions = useMemo(
    () =>
      projectChatSessions({
        messages,
        pinnedSessions,
        query: sessionSearch,
        remoteSessions,
      }),
    [messages, pinnedSessions, remoteSessions, sessionSearch],
  );

  return {
    chatContextCapsule,
    clearDraftForDispatch,
    draft,
    draftAttachments,
    historyError,
    loadingHistory,
    storageWarning,
    retryHistory,
    restoreDraftAfterRejectedDispatch,
    selectedMessages: messages[selectedId] ?? [],
    selectedSession: sessions.find(
      (session) => session.sessionId === selectedId,
    ),
    sessionSearch,
    sessions,
    setDraft,
    setDraftAttachments,
    setChatContextCapsule,
    setDraftForSession,
    setMessages,
    setSessionSearch,
    togglePin,
  };
}
