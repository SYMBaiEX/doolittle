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
  type AttachmentCleanupMap,
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
const HISTORY_PAGE_SIZE = 500;

type PagedSessionMessagesResponse = SessionMessagesResponse & {
  hasEarlier?: boolean;
  nextOffset?: number;
};

interface HistoryPageState {
  hasEarlier: boolean;
  nextOffset: number;
}

function pruneAttachmentCleanup(
  attachments: readonly ManagedAttachmentDescriptor[],
  attachmentCleanup?: AttachmentCleanupMap,
): AttachmentCleanupMap {
  if (!attachmentCleanup) return {};
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  return Object.fromEntries(
    Object.entries(attachmentCleanup).filter(([attachmentId]) =>
      attachmentIds.has(attachmentId),
    ),
  );
}

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
  return reconcilePendingMessages(
    localMessages,
    history,
    activeRequestIds,
    new Map(),
  );
}

function hasCanonicalReplyAfter(
  history: readonly DisplayMessage[],
  matchedUserIndex: number,
): boolean {
  for (let index = matchedUserIndex + 1; index < history.length; index += 1) {
    if (history[index]?.role === "assistant") return true;
    // A later user turn makes a later assistant reply ambiguous. Keep the
    // synthetic row retryable rather than silently attributing that reply.
    if (history[index]?.role === "user") return false;
  }
  return false;
}

function reconcilePendingMessages(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
  activeRequestIds: ReadonlySet<string>,
  matchedHistoryByLocalIndex: ReadonlyMap<number, number>,
  excludeMatchedLocalRows = false,
): DisplayMessage[] {
  return localMessages.flatMap((message, index) => {
    if (excludeMatchedLocalRows && matchedHistoryByLocalIndex.has(index)) {
      return [];
    }
    if (
      message.role !== "assistant" ||
      !message.pending ||
      !message.id.startsWith("assistant:")
    ) {
      return [message];
    }
    const requestId = message.id.slice("assistant:".length);
    const preceding = localMessages[index - 1];
    const matchedUserIndex =
      preceding?.role === "user"
        ? matchedHistoryByLocalIndex.get(index - 1)
        : undefined;
    // Only a canonical assistant belonging to this exact, one-to-one matched
    // user turn may supersede the placeholder. A completed older turn is not
    // evidence that the latest synthetic response completed.
    if (
      matchedUserIndex !== undefined &&
      hasCanonicalReplyAfter(history, matchedUserIndex)
    ) {
      return [];
    }
    // Canonical history is the completed source of truth. It must supersede a
    // locally active placeholder as well; otherwise a late history refresh
    // visibly renders the same assistant turn twice. A still-active request
    // remains pending only when no canonical assistant has completed its turn.
    if (activeRequestIds.has(requestId)) return [message];
    const matchedUserCreatedAt =
      matchedUserIndex === undefined
        ? undefined
        : history[matchedUserIndex]?.createdAt;
    return [
      {
        ...message,
        // History can arrive with a canonical user timestamp a few
        // milliseconds newer than the optimistic row. Keep a retryable
        // placeholder after its matched user in the rendered transcript.
        createdAt:
          matchedUserCreatedAt &&
          message.createdAt.localeCompare(matchedUserCreatedAt) < 0
            ? matchedUserCreatedAt
            : message.createdAt,
        content:
          "This response was interrupted before it finished. Retry it to continue.",
        pending: false,
        error: true,
      },
    ];
  });
}

function sameAttachmentSet(
  left: DisplayMessage["attachments"],
  right: DisplayMessage["attachments"],
): boolean {
  const leftIds = (left ?? []).map((attachment) => attachment.id).sort();
  const rightIds = (right ?? []).map((attachment) => attachment.id).sort();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
}

function sameCapsule(
  left: DisplayMessage["contextCapsule"],
  right: DisplayMessage["contextCapsule"],
): boolean {
  if (!left && !right) return true;
  return (
    left?.kind === right?.kind &&
    left?.path === right?.path &&
    left?.source === right?.source
  );
}

function messageDistance(left: DisplayMessage, right: DisplayMessage): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(leftTime - rightTime);
}

function matchLocalRowsToHistory(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
): Map<number, number> {
  const availableHistory = new Set(history.map((_, index) => index));
  const matchedHistoryByLocalIndex = new Map<number, number>();
  for (const [localIndex, local] of localMessages.entries()) {
    if (local.pending || !local.content) continue;
    const maximumDistance =
      local.role === "assistant" && local.id.startsWith("assistant:")
        ? 24 * 60 * 60 * 1_000
        : 2 * 60 * 1_000;
    const match = [...availableHistory]
      .map((index) => ({ index, message: history[index] }))
      .filter(
        ({ message }) =>
          message.role === local.role &&
          message.content === local.content &&
          sameAttachmentSet(message.attachments, local.attachments) &&
          sameCapsule(message.contextCapsule, local.contextCapsule),
      )
      .map(({ index, message }) => ({
        index,
        distance: messageDistance(message, local),
      }))
      .filter(({ distance }) => distance <= maximumDistance)
      .sort((left, right) => left.distance - right.distance)[0];
    if (!match) continue;
    availableHistory.delete(match.index);
    matchedHistoryByLocalIndex.set(localIndex, match.index);
  }
  return matchedHistoryByLocalIndex;
}

/**
 * Replace optimistic desktop rows with the server-authoritative transcript.
 * IDs differ by design, so reconcile one-to-one by payload and timestamp. The
 * one-to-one match preserves intentionally repeated prompts while preventing a
 * completed turn from rendering twice when history refreshes.
 */
export function mergeConversationHistory(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
  activeRequestIds: ReadonlySet<string>,
): DisplayMessage[] {
  const historyIds = new Set(history.map((message) => message.id));
  const localOnly = localMessages.filter(
    (message) => !historyIds.has(message.id),
  );
  const matchedHistoryByLocalIndex = matchLocalRowsToHistory(
    localOnly,
    history,
  );

  return [
    ...history,
    ...reconcilePendingMessages(
      localOnly,
      history,
      activeRequestIds,
      matchedHistoryByLocalIndex,
      true,
    ),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>(
    {},
  );
  const [historyPages, setHistoryPages] = useState<
    Record<string, HistoryPageState>
  >({});
  const [transcriptStorageWarning, setTranscriptStorageWarning] = useState("");
  const [draftStorageWarning, setDraftStorageWarning] = useState("");
  const [loadingHistory, setLoadingHistory] = useState("");
  const [loadingEarlierHistory, setLoadingEarlierHistory] = useState("");
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
    attachmentCleanup: {},
  };
  const draft = draftState.text;
  const chatContextCapsule = draftState.capsule;
  const draftAttachments = draftState.attachments;
  const draftAttachmentCleanup = pruneAttachmentCleanup(
    draftAttachments,
    draftState.attachmentCleanup,
  );
  const setDraft = useCallback(
    (nextValue: SetStateAction<string>) => {
      bumpDraftRevision(draftSessionId);
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? {
          text: "",
          capsule: null,
          attachments: [],
          attachmentCleanup: {},
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
      attachmentCleanup: AttachmentCleanupMap = {},
    ) => {
      bumpDraftRevision(sessionId);
      setConversationDrafts((current) => ({
        ...current,
        [sessionId]: {
          text: value,
          capsule: null,
          attachments,
          ...(Object.keys(
            pruneAttachmentCleanup(attachments, attachmentCleanup),
          ).length > 0
            ? {
                attachmentCleanup: pruneAttachmentCleanup(
                  attachments,
                  attachmentCleanup,
                ),
              }
            : {}),
        },
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
          attachmentCleanup: {},
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
    (
      attachments: ManagedAttachmentDescriptor[],
      attachmentCleanup?: AttachmentCleanupMap,
    ) => {
      bumpDraftRevision(draftSessionId);
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? {
          text: "",
          capsule: null,
          attachments: [],
          attachmentCleanup: {},
        };
        if (!previous.text && !previous.capsule && attachments.length === 0) {
          if (!Object.hasOwn(current, draftSessionId)) return current;
          const updated = { ...current };
          delete updated[draftSessionId];
          return updated;
        }
        const nextCleanup = pruneAttachmentCleanup(
          attachments,
          attachmentCleanup ?? previous.attachmentCleanup,
        );
        return {
          ...current,
          [draftSessionId]: {
            ...previous,
            attachments,
            ...(Object.keys(nextCleanup).length > 0
              ? { attachmentCleanup: nextCleanup }
              : { attachmentCleanup: undefined }),
          },
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
    setHistoryErrors((current) => {
      if (!current[selectedId]) return current;
      const next = { ...current };
      delete next[selectedId];
      return next;
    });
    const controller = new AbortController();
    let cancelled = false;
    let settled = false;
    const path =
      `/sessions/messages?sessionId=${encodeURIComponent(selectedId)}&limit=${HISTORY_PAGE_SIZE}&offset=0` as const;
    void desktopRequest<PagedSessionMessagesResponse>(
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
          const activeRequestIds = new Set(
            Object.entries(requestSession.current)
              .filter(([, sessionId]) => sessionId === selectedId)
              .map(([requestId]) => requestId),
          );
          return {
            ...current,
            [selectedId]: mergeConversationHistory(
              currentMessages,
              history,
              activeRequestIds,
            ),
          };
        });
        setHistoryPages((current) => ({
          ...current,
          [selectedId]: {
            hasEarlier: Boolean(response.hasEarlier),
            nextOffset: response.nextOffset ?? response.messages.length,
          },
        }));
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        settled = true;
        requestedHistory.current.delete(historyVersion);
        setHistoryErrors((current) => ({
          ...current,
          [selectedId]: errorMessage(error),
        }));
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
      setHistoryErrors((current) => {
        if (!current[sessionId]) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      setHistoryRetryVersion((current) => current + 1);
    },
    [loadingHistory, remoteSessions],
  );

  const loadEarlierHistory = useCallback(
    async (sessionId: string) => {
      const page = historyPages[sessionId];
      if (
        !backendReady ||
        !page?.hasEarlier ||
        loadingEarlierHistory === sessionId
      ) {
        return;
      }
      setLoadingEarlierHistory(sessionId);
      const controller = new AbortController();
      try {
        const path =
          `/sessions/messages?sessionId=${encodeURIComponent(sessionId)}&limit=${HISTORY_PAGE_SIZE}&offset=${page.nextOffset}` as const;
        const response = await desktopRequest<PagedSessionMessagesResponse>(
          path,
          "GET",
          undefined,
          controller.signal,
        );
        const older = response.messages
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
          const existing = current[sessionId] ?? [];
          const existingIds = new Set(existing.map((message) => message.id));
          const merged = [
            ...older.filter((message) => !existingIds.has(message.id)),
            ...existing,
          ].sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt),
          );
          return { ...current, [sessionId]: merged };
        });
        setHistoryPages((current) => ({
          ...current,
          [sessionId]: {
            hasEarlier: Boolean(response.hasEarlier),
            nextOffset:
              response.nextOffset ?? page.nextOffset + response.messages.length,
          },
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryErrors((current) => ({
            ...current,
            [sessionId]: errorMessage(error),
          }));
        }
      } finally {
        setLoadingEarlierHistory((current) =>
          current === sessionId ? "" : current,
        );
      }
    },
    [backendReady, historyPages, loadingEarlierHistory],
  );

  const allSessions = useMemo(
    () =>
      projectChatSessions({
        messages,
        pinnedSessions,
        query: "",
        remoteSessions,
      }),
    [messages, pinnedSessions, remoteSessions],
  );
  const sessions = useMemo(
    () =>
      sessionSearch
        ? projectChatSessions({
            messages,
            pinnedSessions,
            query: sessionSearch,
            remoteSessions,
          })
        : allSessions,
    [allSessions, messages, pinnedSessions, remoteSessions, sessionSearch],
  );

  return {
    chatContextCapsule,
    clearDraftForDispatch,
    draft,
    draftAttachments,
    draftAttachmentCleanup,
    historyError: historyErrors[selectedId] ?? "",
    hasEarlierMessages: Boolean(historyPages[selectedId]?.hasEarlier),
    loadingHistory,
    loadingEarlierHistory,
    loadEarlierHistory,
    storageWarning,
    retryHistory,
    restoreDraftAfterRejectedDispatch,
    selectedMessages: messages[selectedId] ?? [],
    selectedSession: allSessions.find(
      (session) => session.sessionId === selectedId,
    ),
    sessionsCount: allSessions.length,
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
