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
  SessionMessagesResponse,
  SessionSummary,
} from "../../shared/contracts";
import { newConversationId } from "../conversation-id";
import {
  CONVERSATION_PINS_EVENT,
  loadConversationDrafts,
  loadConversationPins,
  type StorageLike,
  saveConversationDrafts,
  saveConversationPins,
} from "../conversation-persistence";
import { desktopRequest, errorMessage } from "../lib";
import type { ConversationStore, DisplayMessage, Role } from "./models";

const CHAT_STORAGE_KEY = "doolittle.desktop.conversations.v2";

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
      Object.entries(parsed).filter(([, messages]) => Array.isArray(messages)),
    ) as ConversationStore;
  } catch {
    return {};
  }
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
  const [loadingHistory, setLoadingHistory] = useState("");
  const [historyRetryVersion, setHistoryRetryVersion] = useState(0);
  const requestedHistory = useRef(new Set<string>());

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

  const setDraftForSession = useCallback((sessionId: string, value: string) => {
    setConversationDrafts((current) => ({
      ...current,
      [sessionId]: value,
    }));
  }, []);

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
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    saveConversationPins(localStorage, pinnedSessions);
  }, [pinnedSessions]);

  useEffect(() => {
    saveConversationDrafts(localStorage, conversationDrafts);
  }, [conversationDrafts]);

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
          .map<DisplayMessage>((message) => ({
            id: message.id,
            role: message.role as Role,
            content: message.text,
            attachments: message.attachments,
            createdAt: message.createdAt,
          }));
        setMessages((current) => {
          const currentMessages = current[selectedId] ?? [];
          const historyIds = new Set(history.map((message) => message.id));
          const localOnly = currentMessages.filter(
            (message) => !historyIds.has(message.id),
          );
          return {
            ...current,
            [selectedId]: [...history, ...localOnly].sort((left, right) =>
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
    draft,
    historyError,
    loadingHistory,
    retryHistory,
    selectedMessages: messages[selectedId] ?? [],
    selectedSession: sessions.find(
      (session) => session.sessionId === selectedId,
    ),
    sessionSearch,
    sessions,
    setDraft,
    setDraftForSession,
    setMessages,
    setSessionSearch,
    togglePin,
  };
}
