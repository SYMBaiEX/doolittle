import type { BotSummary } from "@doolittle/contracts/bots";
import type { UiHostEvent } from "@doolittle/contracts/ui-host";
import { asRecordOrUndefined } from "@elizaos/shared/type-guards";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
} from "react";
import type {
  BackendState,
  ChatEvent,
  SessionSummary,
} from "../../shared/contracts";
import { liveBotIds, loadOwnedRunInventory } from "../bots/run-inventory";
import { safeSetStorageItem } from "../conversation-persistence";
import { NativeUiHost } from "../interfaces/native-ui-host";
import { desktopRequest } from "../lib";
import {
  useWorkspaceRef,
  useWorkspaceState,
} from "../session-workspace/chat-workspace-store";
import {
  chatFailureDisposition,
  failedResponseContent,
} from "./chat-terminal-events";
import {
  CANCELLATION_UNCONFIRMED_MESSAGE,
  retainCancellationFailureFeedback,
} from "./dispatch-readiness";
import {
  type DisplayMessage,
  historicalRunReceipt,
  isDesktopRunUpdate,
  type RunReceipt,
  type RunReceiptStore,
  runEventKey,
} from "./models";
import {
  isTerminalClaimReceipt,
  mergeTerminalRunReceipt,
  type RunClaim,
  RunClaims,
} from "./run-claim-reconciliation";
import {
  effectiveRunHydration,
  type RunHydrationScope,
  type RunHydrationSnapshot,
  sameRunHydrationScope,
} from "./run-hydration-scope";
import { useChatConversationState } from "./useChatConversationState";

const RUN_CURSOR_STORAGE_KEY = "doolittle.desktop.chat-run-cursors.v1";

/** Progress belongs to its originating conversation, not whichever view is selected. */
function setSessionProgress(
  progressBySession: Readonly<Record<string, string>>,
  sessionId: string,
  progress: string,
): Record<string, string> {
  if (progressBySession[sessionId] === progress) return progressBySession;
  return { ...progressBySession, [sessionId]: progress };
}

function clearSessionProgress(
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
function eventText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return (
    ([record.detail, record.message, record.event].find(
      (value) => typeof value === "string",
    ) as string | undefined) ?? ""
  );
}

interface ChatRunLifecycleOptions {
  coordinator: boolean;
  paneReady: boolean;
  nativeHostReady: boolean;
  selectedId: string;
  hostBackend: BackendState;
  inventoryIdentityPath: string;
  bots?: readonly BotSummary[];
  currentBotId: string;
  defaultBotId: string;
  botIdForSession?: (sessionId: string) => string;
  remoteSessions: readonly SessionSummary[];
  onSelect: (sessionId: string) => void;
  onBindSessionBot?: (sessionId: string, botId: string) => void;
  refreshRuntime: () => void;
  setQueueAnnouncement: Dispatch<SetStateAction<string>>;
}

/** The coordinator receives workspace events. Panels share the same run claims and receipts. */
export function useChatRunLifecycle({
  coordinator,
  paneReady,
  nativeHostReady,
  selectedId,
  hostBackend,
  inventoryIdentityPath,
  bots,
  currentBotId,
  defaultBotId,
  botIdForSession,
  remoteSessions,
  onSelect,
  onBindSessionBot,
  refreshRuntime,
  setQueueAnnouncement,
}: ChatRunLifecycleOptions) {
  const [activeRequests, setActiveRequests] = useWorkspaceState<
    Record<string, string>
  >("run.active-requests", {});
  const [dispatchPending, setDispatchPending] = useWorkspaceState<
    Record<string, boolean>
  >("run.dispatch-pending", {});
  const [dispatchFeedback, setDispatchFeedback] = useWorkspaceState<
    Record<string, string>
  >("run.dispatch-feedback", {});
  const runClaims = useWorkspaceRef("run.claim-registry", new RunClaims());
  const activeRequest = activeRequests[selectedId] ?? null;
  const [runHydrationSnapshot, setRunHydrationSnapshot] =
    useWorkspaceState<RunHydrationSnapshot>("run.hydration", {
      scope: null,
      status: "checking",
    });
  const [runHydrationRetry, setRunHydrationRetry] = useWorkspaceState(
    "run.hydration-retry",
    0,
  );
  const [runHydrationWarnings, setRunHydrationWarnings] = useWorkspaceState<
    string[]
  >("run.hydration-warnings", []);
  const recoveryBotIds = liveBotIds(bots).join(",");
  const botIdForSessionRef = useRef(botIdForSession);
  botIdForSessionRef.current = botIdForSession;
  // App may recreate the owner resolver after a sessions poll; compare its
  // resolved owners instead of treating callback identity as a new inventory.
  const recoverySessionOwnerKey = useMemo(
    () =>
      JSON.stringify(
        remoteSessions
          .map((session) => [
            session.sessionId,
            botIdForSession?.(session.sessionId),
          ])
          .sort(([left], [right]) => String(left).localeCompare(String(right))),
      ),
    [remoteSessions, botIdForSession],
  );
  const recoveryScope: RunHydrationScope = useMemo(
    () => ({
      backend: hostBackend,
      workspacePath: inventoryIdentityPath,
      botIds: recoveryBotIds,
      defaultBotId,
      sessionOwners: recoverySessionOwnerKey,
      retry: runHydrationRetry,
    }),
    [
      hostBackend,
      inventoryIdentityPath,
      recoveryBotIds,
      defaultBotId,
      recoverySessionOwnerKey,
      runHydrationRetry,
    ],
  );
  const runHydrationForBot = (botId: string) =>
    effectiveRunHydration(runHydrationSnapshot, recoveryScope, botId);
  const runHydration = runHydrationForBot(currentBotId);
  const visibleRunHydrationWarnings = sameRunHydrationScope(
    runHydrationSnapshot.scope,
    recoveryScope,
  )
    ? runHydrationWarnings
    : [];
  const conversation = useChatConversationState({
    activeRequest,
    backendReady: paneReady,
    onSelect,
    remoteSessions,
    runClaims,
    selectedId,
    persistenceOwner: coordinator,
    nativeHostReady,
    botIdForSession,
  });
  const { setMessages } = conversation;
  const [progressBySession, setProgressBySession] = useWorkspaceState<
    Record<string, string>
  >("run.progress", {});
  const progress = progressBySession[selectedId] ?? "";
  const [runReceipts, setRunReceipts] = useWorkspaceState<RunReceiptStore>(
    "run.receipts",
    {},
  );
  const [runConnections, setRunConnections] = useWorkspaceState<
    Record<string, "disconnected" | "reconnecting">
  >("run.connections", {});
  const subscriptionAttempts = useWorkspaceRef(
    "run.subscriptions",
    new Set<RunClaim>(),
  );
  const reconnectAttempts = useWorkspaceRef(
    "run.reconnect-attempts",
    new Set<RunClaim>(),
  );
  const runConnection = activeRequest
    ? runConnections[activeRequest]
    : undefined;
  const setRunConnection = (
    requestId: string,
    status?: "disconnected" | "reconnecting",
  ) => {
    setRunConnections((current) => {
      if (current[requestId] === status) return current;
      if (status) return { ...current, [requestId]: status };
      const { [requestId]: _removed, ...remaining } = current;
      return remaining;
    });
  };
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
  const runCursors = useWorkspaceRef<Record<string, number> | null>(
    "run.cursors",
    null,
  );
  runCursors.current ??= loadRunCursors();
  const cancellationTimers = useWorkspaceRef<Record<string, number>>(
    "run.cancel-timers",
    {},
  );
  const pendingDeltas = useWorkspaceRef<
    Record<string, { claim: RunClaim; text: string }>
  >("run.pending-deltas", {});
  const deltaFrame = useWorkspaceRef<number | null>("run.delta-frame", null);
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
    const updates = Object.values(pending).filter(
      ({ claim }) => runClaims.current.get(claim.runId) === claim,
    );
    if (!updates.length) return;
    setMessages((current) => {
      const next = { ...current };
      for (const { claim, text } of updates) {
        const { sessionId, runId } = claim;
        next[sessionId] = (next[sessionId] ?? []).map((message) =>
          message.id === `assistant:${runId}`
            ? { ...message, content: message.content + text }
            : message,
        );
      }
      return next;
    });
  }, [setMessages, pendingDeltas, deltaFrame, runClaims]);

  const settleRequest = (
    claim: RunClaim,
    type: "completed" | "cancelled" | "error",
    content?: (previous: string) => string,
    durable = true,
  ) => {
    if (runClaims.current.get(claim.runId) !== claim) return;
    const { runId: requestId, sessionId: completedSessionId } = claim;
    flushPendingDeltas();
    updateAssistant(completedSessionId, requestId, (message) => ({
      ...message,
      content: content
        ? content(message.content)
        : type === "cancelled"
          ? message.content || "Response stopped."
          : message.content,
      pending: false,
      ...(type === "error" ? { error: true } : {}),
    }));
    if (durable) runClaims.current.settle(claim);
    else runClaims.current.release(claim);
    const remainingRuns = runClaims.current.activeIds(completedSessionId);
    const nextRequestId = remainingRuns.values().next().value;
    const cancellationTimer = cancellationTimers.current[requestId];
    if (cancellationTimer !== undefined) {
      window.clearTimeout(cancellationTimer);
      delete cancellationTimers.current[requestId];
    }
    clearCancellingRequest(requestId);
    setRunConnection(requestId);
    setActiveRequests((current) => {
      if (current[completedSessionId] !== requestId) {
        return current;
      }
      if (nextRequestId)
        return { ...current, [completedSessionId]: nextRequestId };
      const { [completedSessionId]: _completed, ...remaining } = current;
      return remaining;
    });
    if (!runClaims.current.forSession(completedSessionId)) {
      setProgressBySession((current) =>
        clearSessionProgress(current, completedSessionId),
      );
      setDispatchFeedback((current) =>
        current[completedSessionId] === CANCELLATION_UNCONFIRMED_MESSAGE
          ? { ...current, [completedSessionId]: "" }
          : current,
      );
    }
    refreshRuntime();
  };

  const acceptTerminalReceipt = (receipt: RunReceipt) => {
    const { type, run } = receipt.latest;
    setRunReceipts((current) => ({
      ...current,
      [run.runId]: mergeTerminalRunReceipt(current[run.runId], receipt),
    }));
    const claim = runClaims.current.get(run.runId);
    if (
      claim &&
      (type === "completed" || type === "cancelled" || type === "error") &&
      isTerminalClaimReceipt(receipt, claim, runClaims.current)
    ) {
      settleRequest(claim, type);
    }
  };

  const reconcileRunClaim = async (claim: RunClaim): Promise<void> => {
    if (!claim.botId || runClaims.current.get(claim.runId) !== claim) return;
    const payload = await desktopRequest<{ run?: unknown }>(
      `/chat/runs/${encodeURIComponent(claim.runId)}`,
      "GET",
      undefined,
      undefined,
      undefined,
      claim.botId,
    );
    const receipt = historicalRunReceipt(payload.run, undefined);
    if (receipt && isTerminalClaimReceipt(receipt, claim, runClaims.current)) {
      acceptTerminalReceipt(receipt);
    }
  };

  const subscribeToRun = async (requestId: string) => {
    const claim = runClaims.current.get(requestId);
    const subscriptions = subscriptionAttempts.current;
    if (!claim?.active || subscriptions.has(claim)) return;
    subscriptions.add(claim);
    try {
      await window.doolittle.subscribeChat({
        requestId,
        after: runCursors.current?.[requestId] ?? 0,
        ...(claim.botId ? { botId: claim.botId } : {}),
      });
    } catch {
      if (runClaims.current.get(requestId) === claim)
        setRunConnection(requestId, "disconnected");
    } finally {
      subscriptions.delete(claim);
    }
  };

  const reconnectRequest = async (requestId: string) => {
    const claim = runClaims.current.get(requestId);
    const attempts = reconnectAttempts.current;
    if (!claim?.active || attempts.has(claim)) return;
    attempts.add(claim);
    setRunConnection(requestId, "reconnecting");
    try {
      await reconcileRunClaim(claim).catch(() => undefined);
      if (runClaims.current.get(requestId) === claim) {
        await subscribeToRun(requestId);
      }
    } finally {
      attempts.delete(claim);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (cancellingRequests[requestId]) return;
    const claim = runClaims.current.get(requestId);
    if (!claim?.active) return;
    setCancellingRequests((current) => ({ ...current, [requestId]: true }));
    setQueueAnnouncement("Stopping the current response…");
    try {
      await window.doolittle.cancelChat(requestId, claim.botId || undefined);
      if (runClaims.current.get(requestId) === claim) {
        cancellationTimers.current[requestId] = window.setTimeout(() => {
          delete cancellationTimers.current[requestId];
          clearCancellingRequest(requestId);
          setQueueAnnouncement(
            "Stopping is taking longer than expected. You can try stopping again while the runtime reconnects.",
          );
        }, 8_000);
      }
    } catch {
      clearCancellingRequest(requestId);
      if (runClaims.current.get(requestId) !== claim) return;
      // An unconfirmed stop is not a terminal run receipt. Retain the owned
      // request/session claim so another send cannot duplicate a live turn.
      setDispatchFeedback((current) =>
        retainCancellationFailureFeedback(current, claim.sessionId),
      );
    }
    // An acknowledged Stop without a verified terminal receipt is still
    // uncertain. Keep the claim until an event or later hydration confirms it.
    await reconcileRunClaim(claim).catch(() => undefined);
  };

  const handleChatEvent = useEffectEvent((event: ChatEvent) => {
    const claim = runClaims.current.get(event.requestId);
    if (!claim?.active) return;
    const failure = chatFailureDisposition(event);
    // The matching startChat rejection owns pre-acceptance draft recovery.
    if (failure === "submission") return;
    if (failure === "disconnected") {
      flushPendingDeltas();
      setRunConnection(claim.runId, "disconnected");
      void reconcileRunClaim(claim).catch(() => undefined);
      return;
    }
    const { sessionId } = claim;
    const { eventId } = event;
    const cursors = runCursors.current;
    if (eventId !== undefined && cursors) {
      const previous = cursors[event.requestId];
      if (previous !== undefined && eventId <= previous) return;
      cursors[event.requestId] = eventId;
      saveRunCursors(cursors);
      setRunConnection(claim.runId);
    }
    if (event.event === "agent.run" && isDesktopRunUpdate(event.data)) {
      const update = event.data;
      if (update.run.runId !== claim.runId || update.sessionId !== sessionId)
        return;
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
      // Only the durable journal emits append-only text frames. Its cursor
      // already suppresses duplicates across reconnects and replay.
      const delta = asRecordOrUndefined(event.data)?.delta;
      if (eventId === undefined || typeof delta !== "string" || !delta) return;
      const prior = pendingDeltas.current[event.requestId];
      pendingDeltas.current[event.requestId] = {
        claim,
        text: (prior?.claim === claim ? prior.text : "") + delta,
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
              : `${bots?.find((bot) => bot.id === claim.botId)?.name ?? "Doolittle"} is working…`),
        ),
      );
      return;
    }
    if (event.event === "response.completed") {
      const response = asRecordOrUndefined(event.data)?.response;
      settleRequest(
        claim,
        "completed",
        (content) =>
          (typeof response === "string" && response) || content || "Done.",
      );
    } else if (failure === "terminal") {
      settleRequest(claim, "error", (content) =>
        failedResponseContent(content, event.data),
      );
    } else if (
      event.event === "cancelled" ||
      event.event === "response.cancelled"
    ) {
      settleRequest(claim, "cancelled");
    }
  });

  const handleNativeRunEvent = useEffectEvent((event: UiHostEvent) => {
    if (event.type !== "run.state") return;
    const claim = runClaims.current.get(event.runId);
    if (!claim) {
      if (!runClaims.current.isSettled(event.runId))
        setRunHydrationRetry((current) => current + 1);
      return;
    }
    // The IPC stream already reports live state. A detached run only needs
    // a lookup of its own receipt, so unrelated chats stay available to send.
    if (
      claim.active &&
      runConnections[event.runId] &&
      event.target.botId === claim.botId &&
      event.target.sessionId === claim.sessionId
    ) {
      void reconcileRunClaim(claim).catch(() => undefined);
    }
  });
  useEffect(() => {
    if (!coordinator || !window.doolittle.ui) return;
    const host = new NativeUiHost(window.doolittle.ui);
    host.subscribe(handleNativeRunEvent);
    return () => host.dispose();
  }, [coordinator]);

  useEffect(() => {
    if (!coordinator) return;
    const unsubscribe = window.doolittle.onChatEvent(handleChatEvent);
    return unsubscribe;
  }, [coordinator]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry nonce deliberately reruns run recovery without changing the host backend phase.
  useEffect(() => {
    if (!coordinator || hostBackend.phase !== "ready") return;
    setRunHydrationSnapshot({ scope: recoveryScope, status: "checking" });
    let disposed = false;
    void loadOwnedRunInventory(recoveryBotIds ? recoveryBotIds.split(",") : [])
      .then((payload) => {
        if (disposed) return;
        setRunHydrationWarnings(payload.warnings);
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
              : botIdForSessionRef.current?.(sessionId) || defaultBotId;
          if (
            !["desktop", "desktop-ui", "desktop-consultation"].includes(
              String(run.source),
            )
          )
            continue;
          if (!runId || !sessionId) continue;
          if (["complete", "cancelled", "error"].includes(status)) {
            const receipt = historicalRunReceipt(run, payload.updates[runId]);
            if (receipt) acceptTerminalReceipt(receipt);
            continue;
          }
          if (!runClaims.current.recover(runId, sessionId, botId)) continue;
          if (botId) onBindSessionBot?.(sessionId, botId);
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
          void subscribeToRun(runId);
        }
        setRunHydrationSnapshot({
          scope: recoveryScope,
          status: "ready",
          failedBotIds: payload.failedBotIds,
        });
      })
      .catch(() => {
        if (!disposed) {
          setRunHydrationSnapshot({
            scope: recoveryScope,
            status: "unavailable",
          });
          setRunHydrationWarnings([]);
        }
      });
    return () => {
      disposed = true;
    };
  }, [
    hostBackend.phase,
    coordinator,
    setMessages,
    setRunHydrationSnapshot,
    setRunHydrationWarnings,
    setRunReceipts,
    runClaims,
    setActiveRequests,
    runCursors,
    runHydrationRetry,
    defaultBotId,
    onBindSessionBot,
    recoveryBotIds,
    recoveryScope,
  ]);

  const publishProgress = (sessionId: string, text: string) =>
    setProgressBySession((current) =>
      setSessionProgress(current, sessionId, text),
    );

  return {
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
    retryRunHydration: () => setRunHydrationRetry((current) => current + 1),
    conversation,
    progress,
    publishProgress,
    runReceipts,
    runConnection,
    cancellingRequest,
    settleRequest,
    reconnectRequest,
    cancelRequest,
  };
}
