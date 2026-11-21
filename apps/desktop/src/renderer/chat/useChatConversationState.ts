import {
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  saveConversationDrafts,
  saveConversationPins,
} from "../conversation-persistence";
import { NativeDraftBridge } from "../interfaces/native-draft-bridge";
import { NativeUiHost } from "../interfaces/native-ui-host";
import { desktopRequest, errorMessage } from "../lib";
import {
  CHAT_DRAFTS_STATE_KEY,
  useWorkspaceRef,
  useWorkspaceState,
} from "../session-workspace/chat-workspace-store";
import {
  canRestoreRejectedDispatch,
  type DraftDispatchRecovery,
} from "./draft-dispatch-recovery";
import {
  extendHistoryPage,
  type HistoryPageState,
  refreshHistoryPage,
  TRANSCRIPT_PAGE_SIZE,
} from "./history-pagination";
import { mergeConversationHistory } from "./history-reconciliation";
import type {
  ChatContextMessageCapsule,
  ConversationStore,
  DisplayMessage,
} from "./models";

import type { RunClaims } from "./run-claim-reconciliation";
import {
  createTranscriptCacheWriter,
  loadStoredChatMessages,
} from "./transcript-cache";

const MAX_RECENT_HISTORY_FETCH_SIZE = 500;

type PagedSessionMessagesResponse = SessionMessagesResponse & {
  hasEarlier?: boolean;
  nextOffset?: number;
  totalMessages?: number;
};

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

const EMPTY_DRAFT: ConversationDraft = {
  text: "",
  capsule: null,
  attachments: [],
};

async function fetchHistoryPage(
  sessionId: string,
  owner: string | undefined,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<{ messages: DisplayMessage[]; page: HistoryPageState }> {
  const response = await desktopRequest<PagedSessionMessagesResponse>(
    `/sessions/messages?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}&offset=${offset}`,
    "GET",
    undefined,
    signal,
    undefined,
    owner,
  );
  const messages: DisplayMessage[] = [];
  for (const { id, role, text, attachments, createdAt } of response.messages) {
    if (role !== "user" && role !== "assistant") continue;
    const handoff = role === "user" ? splitChatContext(text) : undefined;
    const capsule = handoff?.capsule ?? undefined;
    const contextCapsule: ChatContextMessageCapsule | undefined = capsule && {
      kind: capsule.kind,
      path: capsule.path,
      ...(capsule.source ? { source: capsule.source } : {}),
    };
    messages.push({
      id,
      role,
      content: handoff?.prompt ?? text,
      attachments,
      createdAt,
      ...(contextCapsule ? { contextCapsule } : {}),
    });
  }
  return {
    messages,
    page: {
      hasEarlier: Boolean(response.hasEarlier),
      nextOffset: response.nextOffset ?? offset + response.messages.length,
      totalMessages: response.totalMessages,
      messageIds: response.messages.map(({ id }) => id),
    },
  };
}

export interface ChatSessionForRender extends SessionSummary {
  pinned: boolean;
}

function projectChatSessions({
  messages,
  pinnedSessions,
  remoteSessions,
}: {
  messages: ConversationStore;
  pinnedSessions: Readonly<Record<string, boolean>>;
  remoteSessions: readonly SessionSummary[];
}): ChatSessionForRender[] {
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
      messageCount: Math.max(
        remoteSession?.messageCount ?? 0,
        localMessages.length,
      ),
      endedAt: last?.createdAt,
      participants: [],
      preview: firstUser ? [firstUser.content] : [],
    });
  }

  return [...byId.values()]
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
  runClaims,
  selectedId,
  persistenceOwner = true,
  botIdForSession,
  nativeHostReady = backendReady,
}: {
  activeRequest: string | null;
  backendReady: boolean;
  onSelect: (sessionId: string) => void;
  remoteSessions: readonly SessionSummary[];
  runClaims: RefObject<RunClaims>;
  selectedId: string;
  persistenceOwner?: boolean;
  botIdForSession?: (sessionId: string) => string;
  nativeHostReady?: boolean;
}) {
  const initialId = useMemo(
    () => selectedId || newConversationId(),
    [selectedId],
  );
  const [messages, setMessages] = useWorkspaceState<ConversationStore>(
    "conversation.messages",
    () => {
      const stored = loadStoredChatMessages(localStorage);
      return Object.hasOwn(stored, initialId)
        ? stored
        : { ...stored, [initialId]: [] };
    },
  );
  const cachedHistoryLength = useRef(0);
  cachedHistoryLength.current = messages[selectedId]?.length ?? 0;
  const draftSessionId = selectedId || initialId;
  const [conversationDrafts, setConversationDrafts] = useWorkspaceState(
    CHAT_DRAFTS_STATE_KEY,
    () => loadConversationDrafts(localStorage),
  );
  const [pinnedSessions, setPinnedSessions] = useWorkspaceState(
    "conversation.pins",
    () => loadConversationPins(localStorage),
  );
  const [historyErrors, setHistoryErrors] = useWorkspaceState<
    Record<string, string>
  >("conversation.history-errors", {});
  const [historyPages, setHistoryPages] = useWorkspaceState<
    Record<string, HistoryPageState>
  >("conversation.history-pages", {});
  const historyPagesRef = useRef(historyPages);
  historyPagesRef.current = historyPages;
  const [transcriptStorageWarning, setTranscriptStorageWarning] =
    useWorkspaceState("conversation.transcript-warning", "");
  const transcriptWriter = useRef<ReturnType<
    typeof createTranscriptCacheWriter
  > | null>(null);
  const [draftStorageWarning, setDraftStorageWarning] = useWorkspaceState(
    "conversation.draft-warning",
    "",
  );
  const [loadingHistory, setLoadingHistory] = useWorkspaceState(
    `conversation.loading.${selectedId}`,
    "",
  );
  const [loadingEarlierHistory, setLoadingEarlierHistory] = useWorkspaceState(
    `conversation.earlier.${selectedId}`,
    "",
  );
  const [historyRetryVersion, setHistoryRetryVersion] = useWorkspaceState(
    `conversation.retry.${selectedId}`,
    0,
  );
  const historyRequests = useWorkspaceRef(
    "conversation.history-requests",
    new Map<string, AbortController>(),
  );
  const requestedHistory = useRef(new Map<string, string>());
  const draftRevisions = useWorkspaceRef<Record<string, number>>(
    "conversation.draft-revisions",
    {},
  );

  const bumpDraftRevision = useCallback(
    (sessionId: string) => {
      const revision = (draftRevisions.current[sessionId] ?? 0) + 1;
      draftRevisions.current[sessionId] = revision;
      return revision;
    },
    [draftRevisions],
  );
  const localDraftOwner = useRef(botIdForSession);
  localDraftOwner.current = botIdForSession;
  const nativeDraftBridge = useRef<NativeDraftBridge | undefined>(undefined);

  const updateDraft = useCallback(
    (
      sessionId: string,
      update: (previous: ConversationDraft) => ConversationDraft,
    ) => {
      const revision = bumpDraftRevision(sessionId);
      setConversationDrafts((current) => {
        const next = update(current[sessionId] ?? EMPTY_DRAFT);
        if (next.text || next.capsule || next.attachments.length) {
          return { ...current, [sessionId]: next };
        }
        if (!Object.hasOwn(current, sessionId)) return current;
        const { [sessionId]: _removed, ...remaining } = current;
        return remaining;
      });
      return revision;
    },
    [bumpDraftRevision, setConversationDrafts],
  );

  const nativeDraftsEnabled = persistenceOwner && !!botIdForSession;
  useEffect(() => {
    if (!nativeDraftsEnabled || !window.doolittle?.ui) return;
    const host = new NativeUiHost(window.doolittle.ui);
    const drafts = new NativeDraftBridge({
      host,
      bind: async (target) => {
        await desktopRequest(
          `/bots/${encodeURIComponent(target.botId)}/conversations`,
          "POST",
          {
            sessionId: target.sessionId,
            ...(target.projectId ? { projectId: target.projectId } : {}),
          },
        );
      },
      revision: (sessionId) => draftRevisions.current[sessionId] ?? 0,
      apply: (target, text) => {
        if (localDraftOwner.current?.(target.sessionId) !== target.botId)
          return;
        updateDraft(target.sessionId, (previous) => ({ ...previous, text }));
      },
    });
    nativeDraftBridge.current = drafts;
    host.subscribe((event) => {
      if (
        event.type === "draft.changed" &&
        localDraftOwner.current?.(event.target.sessionId) === event.target.botId
      )
        void drafts.refresh(event.target).catch(() => undefined);
    });
    return () => {
      nativeDraftBridge.current = undefined;
      host.dispose();
    };
  }, [nativeDraftsEnabled, draftRevisions, updateDraft]);
  useEffect(() => {
    if (
      !persistenceOwner ||
      !nativeHostReady ||
      !nativeDraftBridge.current ||
      !botIdForSession
    )
      return;
    for (const sessionId of new Set([
      selectedId,
      ...Object.keys(conversationDrafts),
    ])) {
      const botId = botIdForSession(sessionId);
      if (!botId) continue;
      const session = remoteSessions.find(
        (item) => item.sessionId === sessionId,
      );
      // Automatic draft persistence is never an access-grant entry point.
      // Wait for the host to surface its immutable session binding.
      if (!session?.workspacePath) continue;
      const projectTarget = session.projectId
        ? { projectId: session.projectId }
        : {};
      const target = {
        botId,
        sessionId,
        ...projectTarget,
      };
      void nativeDraftBridge.current
        .sync(
          target,
          conversationDrafts[sessionId]?.text ?? "",
          draftRevisions.current[sessionId] ?? 0,
        )
        .catch(() =>
          setDraftStorageWarning(
            "The native draft copy is unavailable. Your local draft has been kept; restore the default interface before switching layouts.",
          ),
        );
    }
  }, [
    nativeHostReady,
    persistenceOwner,
    selectedId,
    conversationDrafts,
    botIdForSession,
    remoteSessions,
    draftRevisions,
    setDraftStorageWarning,
  ]);

  const {
    text: draft,
    capsule: chatContextCapsule,
    attachments: draftAttachments,
    attachmentCleanup,
  } = conversationDrafts[draftSessionId] ?? EMPTY_DRAFT;
  const draftAttachmentCleanup = pruneAttachmentCleanup(
    draftAttachments,
    attachmentCleanup,
  );
  const setDraft = useCallback(
    (next: SetStateAction<string>) =>
      updateDraft(draftSessionId, (previous) => ({
        ...previous,
        text: typeof next === "function" ? next(previous.text) : next,
      })),
    [draftSessionId, updateDraft],
  );

  const setDraftForSession = useCallback(
    (
      sessionId: string,
      text: string,
      attachments: ManagedAttachmentDescriptor[] = [],
    ) => updateDraft(sessionId, () => ({ text, capsule: null, attachments })),
    [updateDraft],
  );

  const setChatContextCapsule = useCallback(
    (capsule: ChatContextCapsule | null) =>
      updateDraft(draftSessionId, (previous) => ({ ...previous, capsule })),
    [draftSessionId, updateDraft],
  );

  const setDraftAttachments = useCallback(
    (
      attachments: ManagedAttachmentDescriptor[],
      cleanup?: AttachmentCleanupMap,
    ) =>
      updateDraft(draftSessionId, (previous) => ({
        ...previous,
        attachments,
        attachmentCleanup: pruneAttachmentCleanup(
          attachments,
          cleanup ?? previous.attachmentCleanup,
        ),
      })),
    [draftSessionId, updateDraft],
  );

  const clearDraftForDispatch = useCallback(
    (sessionId: string) => updateDraft(sessionId, () => EMPTY_DRAFT),
    [updateDraft],
  );
  const getDraftRevision = useCallback(
    (sessionId: string) => draftRevisions.current[sessionId] ?? 0,
    [draftRevisions],
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
      updateDraft(recovery.sessionId, () => recovery.draft);
      return true;
    },
    [updateDraft, draftRevisions],
  );

  const togglePin = useCallback(
    (sessionId: string) => {
      setPinnedSessions((current) => {
        const next = { ...current };
        if (next[sessionId]) delete next[sessionId];
        else next[sessionId] = true;
        saveConversationPins(localStorage, next);
        window.dispatchEvent(new Event(CONVERSATION_PINS_EVENT));
        return next;
      });
    },
    [setPinnedSessions],
  );

  useEffect(() => {
    if (!selectedId) onSelect(initialId);
  }, [initialId, onSelect, selectedId]);

  useEffect(() => {
    if (!persistenceOwner) return;
    const writer = createTranscriptCacheWriter(localStorage, (persisted) => {
      if (transcriptWriter.current !== writer) return;
      setTranscriptStorageWarning(
        persisted
          ? ""
          : "Local transcript cache is unavailable. Your conversation remains active, and server history is unaffected.",
      );
    });
    transcriptWriter.current = writer;
    window.addEventListener("pagehide", writer.flush);
    return () => {
      window.removeEventListener("pagehide", writer.flush);
      transcriptWriter.current = null;
      writer.flush();
    };
  }, [setTranscriptStorageWarning, persistenceOwner]);

  useEffect(() => {
    if (persistenceOwner)
      transcriptWriter.current?.schedule(messages, selectedId);
  }, [messages, selectedId, persistenceOwner]);

  useEffect(() => {
    if (!persistenceOwner) return;
    saveConversationPins(localStorage, pinnedSessions);
  }, [pinnedSessions, persistenceOwner]);

  useEffect(() => {
    if (!persistenceOwner) return;
    const persisted = saveConversationDrafts(localStorage, conversationDrafts);
    setDraftStorageWarning(
      persisted
        ? ""
        : "Local draft cache is unavailable. Your unsent draft remains active, and server history is unaffected.",
    );
  }, [conversationDrafts, setDraftStorageWarning, persistenceOwner]);

  const storageWarning = [transcriptStorageWarning, draftStorageWarning]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!persistenceOwner) return;
    const syncPins = () =>
      setPinnedSessions(loadConversationPins(localStorage));
    window.addEventListener(CONVERSATION_PINS_EVENT, syncPins);
    return () => window.removeEventListener(CONVERSATION_PINS_EVENT, syncPins);
  }, [setPinnedSessions, persistenceOwner]);

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
  }, [remoteSessions, selectedId, setMessages]);

  const remoteSession = remoteSessions.find(
    (session) => session.sessionId === selectedId,
  );
  const selectedOwner = botIdForSession?.(selectedId);
  const historyVersion = remoteSession
    ? JSON.stringify([
        selectedOwner,
        remoteSession.messageCount,
        remoteSession.endedAt,
      ])
    : undefined;
  const selectedRequestIsActive = Boolean(
    activeRequest &&
      runClaims.current.get(activeRequest)?.sessionId === selectedId,
  );
  const canFetchHistory =
    backendReady &&
    Boolean(selectedId) &&
    (!botIdForSession || Boolean(selectedOwner)) &&
    !selectedRequestIsActive &&
    loadingEarlierHistory !== selectedId;

  // Depend on the selected history version, not the replaceable bot/session
  // inventory. A poll with identical ownership and counts must not restart IPC.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry nonce intentionally re-runs the same history request after an error.
  useEffect(() => {
    if (!canFetchHistory || historyVersion === undefined) return;
    if (requestedHistory.current.get(selectedId) === historyVersion) return;
    if (historyRequests.current.has(selectedId)) return;
    requestedHistory.current.set(selectedId, historyVersion);
    const controller = new AbortController();
    historyRequests.current.set(selectedId, controller);
    setLoadingHistory(selectedId);
    setHistoryErrors((current) => {
      if (!current[selectedId]) return current;
      const next = { ...current };
      delete next[selectedId];
      return next;
    });
    let settled = false;
    // A cold transcript needs only one screenful. Keep the authoritative tail
    // deep enough to validate history already present in the offline cache.
    const pageSize = Math.min(
      Math.max(TRANSCRIPT_PAGE_SIZE, cachedHistoryLength.current),
      MAX_RECENT_HISTORY_FETCH_SIZE,
    );
    void fetchHistoryPage(
      selectedId,
      selectedOwner,
      0,
      pageSize,
      controller.signal,
    )
      .then(({ messages: history, page }) => {
        if (controller.signal.aborted) return;
        settled = true;
        const refreshed = refreshHistoryPage(
          historyPagesRef.current[selectedId],
          page,
        );
        setMessages((current) => {
          const currentMessages = current[selectedId] ?? [];
          const activeRequestIds = runClaims.current.activeIds(selectedId);
          const previousPrefix = currentMessages.filter((message) =>
            refreshed.retainIds.has(message.id),
          );
          return {
            ...current,
            [selectedId]: mergeConversationHistory(
              currentMessages,
              [...previousPrefix, ...history],
              activeRequestIds,
            ),
          };
        });
        setHistoryPages((current) => ({
          ...current,
          [selectedId]: refreshed.page,
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        settled = true;
        requestedHistory.current.delete(selectedId);
        setHistoryErrors((current) => ({
          ...current,
          [selectedId]: errorMessage(error),
        }));
      })
      .finally(() => {
        if (historyRequests.current.get(selectedId) === controller) {
          historyRequests.current.delete(selectedId);
          setLoadingHistory("");
        }
      });

    return () => {
      controller.abort();
      if (!settled) requestedHistory.current.delete(selectedId);
      if (historyRequests.current.get(selectedId) === controller) {
        historyRequests.current.delete(selectedId);
        setLoadingHistory("");
      }
    };
  }, [
    canFetchHistory,
    historyRequests,
    historyRetryVersion,
    historyVersion,
    runClaims,
    selectedId,
    selectedOwner,
  ]);

  const retryHistory = useCallback(
    (sessionId: string) => {
      if (loadingHistory === sessionId) return;
      const session = remoteSessions.find(
        (entry) => entry.sessionId === sessionId,
      );
      if (!session) return;
      requestedHistory.current.delete(sessionId);
      setHistoryErrors((current) => {
        if (!current[sessionId]) return current;
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      setHistoryRetryVersion((current) => current + 1);
    },
    [loadingHistory, remoteSessions, setHistoryErrors, setHistoryRetryVersion],
  );

  const loadEarlierHistory = useCallback(
    async (sessionId: string) => {
      const page = historyPages[sessionId];
      const owner = botIdForSession?.(sessionId);
      if (
        !backendReady ||
        (botIdForSession && !owner) ||
        !page?.hasEarlier ||
        historyRequests.current.has(sessionId)
      ) {
        return;
      }
      const controller = new AbortController();
      historyRequests.current.set(sessionId, controller);
      setLoadingEarlierHistory(sessionId);
      try {
        const { messages: older, page: nextPage } = await fetchHistoryPage(
          sessionId,
          owner,
          page.nextOffset,
          TRANSCRIPT_PAGE_SIZE,
          controller.signal,
        );
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
          [sessionId]: extendHistoryPage(page, nextPage),
        }));
      } finally {
        historyRequests.current.delete(sessionId);
        setLoadingEarlierHistory((current) =>
          current === sessionId ? "" : current,
        );
      }
    },
    [
      backendReady,
      historyPages,
      historyRequests,
      setMessages,
      setLoadingEarlierHistory,
      setHistoryPages,
      botIdForSession,
    ],
  );

  const sessions = useMemo(
    () =>
      projectChatSessions({
        messages,
        pinnedSessions,
        remoteSessions,
      }),
    [messages, pinnedSessions, remoteSessions],
  );
  return {
    chatContextCapsule,
    clearDraftForDispatch,
    getDraftRevision,
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
    selectedSession: sessions.find(
      (session) => session.sessionId === selectedId,
    ),
    sessions,
    setDraft,
    setDraftAttachments,
    setChatContextCapsule,
    setDraftForSession,
    setMessages,
    togglePin,
  };
}
