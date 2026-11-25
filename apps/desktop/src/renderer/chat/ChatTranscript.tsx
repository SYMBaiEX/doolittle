import { Button, ContextActionMenu, StateSurface } from "@doolittle/ui";
import {
  AlertCircle,
  ChevronUp,
  LoaderCircle,
  MoreHorizontal,
} from "lucide-react";
import {
  memo,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UiIcon } from "../components/UiIcon";
import { useWorkspaceState } from "../session-workspace/chat-workspace-store";
import { ChatMessage } from "./ChatMessage";
import { TRANSCRIPT_PAGE_SIZE } from "./history-pagination";
import { getMessageActions, MessageCopyButton } from "./MessageActions";
import type {
  BranchMode,
  CopyState,
  DisplayMessage,
  RunReceiptStore,
} from "./models";
import { Welcome } from "./Welcome";
import "./chat-transcript.css";

export interface ChatTranscriptProps {
  sessionId: string;
  loading: boolean;
  historyError: string;
  messages: DisplayMessage[];
  runReceipts: RunReceiptStore;
  progress: string;
  projectName?: string;
  botName?: string;
  endRef: RefObject<HTMLDivElement | null>;
  backendReady: boolean;
  activeRequest: string | null;
  forkingMessageId: string;
  copyStates: Record<string, CopyState>;
  speechSupported: boolean;
  speakingMessageId: string;
  onBranch: (message: DisplayMessage, mode: BranchMode) => void;
  onCopy: (message: DisplayMessage) => void;
  onRead: (message: DisplayMessage) => void;
  onRetryHistory: () => void;
  onRetryMessage?: (message: DisplayMessage) => void;
  onStopReading: () => void;
  onPromote?: (message: DisplayMessage) => void;
  onViewChanges?: () => void;
  onSelectPrompt: (prompt: string) => void;
  hasEarlierMessages?: boolean;
  loadingEarlierHistory?: boolean;
  onLoadEarlier?: () => Promise<void> | void;
}

type MessageCallbacks = Pick<
  ChatTranscriptProps,
  | "onBranch"
  | "onCopy"
  | "onRead"
  | "onRetryMessage"
  | "onStopReading"
  | "onPromote"
  | "onViewChanges"
>;

interface TranscriptMessageRowProps {
  botName?: string;
  activeRequest: string | null;
  backendReady: boolean;
  callbacks: RefObject<MessageCallbacks>;
  canPromote: boolean;
  canRetry: boolean;
  canViewChanges: boolean;
  copyState?: CopyState;
  forkingMessageId: string;
  message: DisplayMessage;
  progress?: string;
  receipt: RunReceiptStore[string] | undefined;
  speakingMessageId: string;
  speechSupported: boolean;
}

const TranscriptMessageRow = memo(function TranscriptMessageRow({
  botName,
  activeRequest,
  backendReady,
  callbacks,
  canPromote,
  canRetry,
  canViewChanges,
  copyState,
  forkingMessageId,
  message,
  progress,
  receipt,
  speakingMessageId,
  speechSupported,
}: TranscriptMessageRowProps) {
  const onCopy = (value: DisplayMessage) => callbacks.current.onCopy(value);
  const actionsLabel =
    message.role === "assistant" ? "Response actions" : "Message actions";
  const actions = getMessageActions({
    activeRequest,
    backendReady,
    forkingMessageId,
    message,
    onBranch: (value, mode) => callbacks.current.onBranch(value, mode),
    onCopy,
    onRead: (value) => callbacks.current.onRead(value),
    onStopReading: () => callbacks.current.onStopReading(),
    onPromote: canPromote
      ? (value) => callbacks.current.onPromote?.(value)
      : undefined,
    speakingMessageId,
    speechSupported,
  });
  return (
    <ContextActionMenu
      className="chat-transcript-entry"
      label={actionsLabel}
      items={actions}
      scopeKey={message.id}
      trigger={
        <Button
          aria-label={`More ${actionsLabel.toLowerCase()}`}
          className="chat-turn-action chat-turn-overflow"
          size="sm"
          title={actionsLabel}
          type="button"
          variant="ghost"
        >
          <UiIcon icon={MoreHorizontal} size="sm" />
        </Button>
      }
    >
      <ChatMessage
        botName={botName}
        actions={
          <MessageCopyButton
            copyState={copyState}
            onCopy={() => onCopy(message)}
          />
        }
        message={message}
        progress={progress}
        onRetry={
          canRetry
            ? () => callbacks.current.onRetryMessage?.(message)
            : undefined
        }
        onViewChanges={
          canViewChanges ? () => callbacks.current.onViewChanges?.() : undefined
        }
        receipt={receipt}
        retryDisabled={
          !backendReady || Boolean(activeRequest) || Boolean(forkingMessageId)
        }
      />
    </ContextActionMenu>
  );
});

function messageRunId(message: DisplayMessage): string | undefined {
  if (message.role !== "assistant") return undefined;
  return (
    message.runId ??
    (message.id.startsWith("assistant:")
      ? message.id.slice("assistant:".length)
      : undefined)
  );
}

export function ChatTranscript({
  sessionId,
  loading,
  historyError,
  messages,
  runReceipts,
  progress,
  projectName,
  botName,
  endRef,
  backendReady,
  activeRequest,
  forkingMessageId,
  copyStates,
  speechSupported,
  speakingMessageId,
  onBranch,
  onCopy,
  onPromote,
  onRead,
  onRetryHistory,
  onRetryMessage,
  onStopReading,
  onViewChanges,
  onSelectPrompt,
  hasEarlierMessages = false,
  loadingEarlierHistory = false,
  onLoadEarlier,
}: ChatTranscriptProps) {
  const [visibleStartId, setVisibleStartId] = useWorkspaceState<string>(
    `view.transcript-start.${sessionId}`,
    "",
  );
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [anchorSession, setAnchorSession] = useState<string | null>(null);
  const [earlierErrorSession, setEarlierErrorSession] = useState<string | null>(
    null,
  );
  const anchoredHistoryPending = anchorSession === sessionId;
  const historyAnchorRef = useRef<{
    sessionId: string;
    messageId: string;
    fetchesEarlierPage: boolean;
    row: Element;
    contentTop: number;
    focusedTrigger: HTMLButtonElement | null;
  } | null>(null);

  const recentStart = Math.max(0, messages.length - TRANSCRIPT_PAGE_SIZE);
  const previousStart = visibleStartId
    ? messages.findIndex(({ id }) => id === visibleStartId)
    : -1;
  const activeStart = activeRequest
    ? messages.findIndex(
        (message) =>
          message.runId === activeRequest ||
          messageRunId(message) === activeRequest,
      )
    : -1;
  const anchor = historyAnchorRef.current;
  const prependedPage =
    anchor?.sessionId === sessionId &&
    anchor.fetchesEarlierPage &&
    messages[0]?.id !== anchor.messageId;
  const firstMessageIndex = prependedPage
    ? 0
    : Math.min(
        recentStart,
        previousStart < 0 ? recentStart : previousStart,
        activeStart < 0 ? recentStart : activeStart,
      );
  const firstMessageId = messages[firstMessageIndex]?.id ?? "";
  const hasCachedEarlier = firstMessageIndex > 0;
  const earlierHistoryError =
    !hasCachedEarlier && earlierErrorSession === sessionId;

  useLayoutEffect(() => {
    if (firstMessageId && firstMessageId !== visibleStartId)
      setVisibleStartId(firstMessageId);
  }, [firstMessageId, setVisibleStartId, visibleStartId]);

  const messageCallbacks = {
    onBranch,
    onCopy,
    onRead,
    onRetryMessage,
    onStopReading,
    onPromote,
    onViewChanges,
  };
  const callbacks = useRef(messageCallbacks);
  useLayoutEffect(() => {
    // Row controls dispatch against the committed conversation, even when an
    // unchanged message skipped rendering during a draft or stream update.
    callbacks.current = messageCallbacks;
  });
  const canPromote = Boolean(onPromote);
  const canRetry = Boolean(onRetryMessage);
  const canViewChanges = Boolean(onViewChanges);
  const rows = useMemo(
    () =>
      messages.slice(firstMessageIndex).map((message) => {
        const runId = messageRunId(message);
        return (
          <TranscriptMessageRow
            botName={botName}
            activeRequest={activeRequest}
            backendReady={backendReady}
            callbacks={callbacks}
            canPromote={canPromote}
            canRetry={canRetry}
            canViewChanges={canViewChanges}
            copyState={copyStates[message.id]}
            forkingMessageId={forkingMessageId}
            key={message.id}
            message={message}
            progress={runId && runId === activeRequest ? progress : undefined}
            receipt={runId ? runReceipts[runId] : undefined}
            speakingMessageId={speakingMessageId}
            speechSupported={speechSupported}
          />
        );
      }),
    [
      messages,
      progress,
      firstMessageIndex,
      botName,
      activeRequest,
      backendReady,
      canPromote,
      canRetry,
      canViewChanges,
      copyStates,
      forkingMessageId,
      runReceipts,
      speakingMessageId,
      speechSupported,
    ],
  );
  useLayoutEffect(() => {
    const anchor = historyAnchorRef.current;
    const transcript = transcriptRef.current;
    if (!anchor || !transcript) return;

    if (anchor.sessionId === sessionId && anchor.row.isConnected) {
      if (firstMessageId !== anchor.messageId) {
        const contentTop =
          anchor.row.getBoundingClientRect().top + transcript.scrollTop;
        transcript.scrollTop += contentTop - anchor.contentTop;
      } else if (anchoredHistoryPending || loadingEarlierHistory) {
        return;
      }
      if (
        anchor.focusedTrigger &&
        transcript.ownerDocument.activeElement === transcript.ownerDocument.body
      ) {
        const target = anchor.focusedTrigger.isConnected
          ? anchor.focusedTrigger
          : transcript;
        target.focus({ preventScroll: true });
      }
    }

    transcript.style.removeProperty("overflow-anchor");
    historyAnchorRef.current = null;
  }, [
    anchoredHistoryPending,
    loadingEarlierHistory,
    firstMessageId,
    sessionId,
  ]);

  const showStandaloneProgress = Boolean(
    progress &&
      (!activeRequest ||
        !runReceipts[activeRequest] ||
        !messages.some((message) => messageRunId(message) === activeRequest)),
  );

  return (
    <div
      aria-busy={loading || undefined}
      aria-label={projectName ? `${projectName} conversation` : "Conversation"}
      aria-live="off"
      className="chat-messages"
      ref={transcriptRef}
      role="log"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll long stretches of non-interactive transcript history.
      tabIndex={0}
    >
      {loading && !messages.length ? (
        <StateSurface kind="loading" title="Loading conversation…" />
      ) : historyError && !messages.length ? (
        <StateSurface
          kind="error"
          action={
            <button
              className="chat-transcript-command"
              onClick={onRetryHistory}
              type="button"
            >
              Retry
            </button>
          }
          title="Conversation unavailable"
        >
          {historyError}
        </StateSurface>
      ) : messages.length ? (
        <>
          {loading ? (
            <p className="chat-transcript-notice" role="status">
              <UiIcon
                className="chat-turn-spinner"
                icon={LoaderCircle}
                size="sm"
              />
              <span>Refreshing conversation…</span>
            </p>
          ) : historyError ? (
            <div
              className="chat-transcript-notice chat-transcript-notice--error"
              role="alert"
            >
              <UiIcon icon={AlertCircle} size="sm" />
              <span>History could not be refreshed. {historyError}</span>
              <button
                className="chat-transcript-command"
                onClick={onRetryHistory}
                type="button"
              >
                Retry history
              </button>
            </div>
          ) : null}
          {hasCachedEarlier || (hasEarlierMessages && onLoadEarlier) ? (
            <div className="chat-load-earlier">
              <button
                aria-busy={
                  loadingEarlierHistory || anchoredHistoryPending || undefined
                }
                aria-label={
                  earlierHistoryError
                    ? "Retry loading earlier messages"
                    : "Load earlier messages"
                }
                className="chat-transcript-command"
                disabled={loadingEarlierHistory || anchoredHistoryPending}
                onClick={async (event) => {
                  const transcript = transcriptRef.current;
                  const row = transcript?.querySelector("[data-message-role]");
                  if (transcript && row && firstMessageId) {
                    // Apply only the displacement caused by prepended rows.
                    // The reader can keep scrolling while history loads.
                    transcript.style.setProperty("overflow-anchor", "none");
                    historyAnchorRef.current = {
                      sessionId,
                      messageId: firstMessageId,
                      fetchesEarlierPage: !hasCachedEarlier,
                      row,
                      contentTop:
                        row.getBoundingClientRect().top + transcript.scrollTop,
                      focusedTrigger:
                        transcript.ownerDocument.activeElement ===
                        event.currentTarget
                          ? event.currentTarget
                          : null,
                    };
                  }
                  setEarlierErrorSession(null);
                  if (hasCachedEarlier) {
                    const earlierIndex = Math.max(
                      0,
                      firstMessageIndex - TRANSCRIPT_PAGE_SIZE,
                    );
                    setVisibleStartId(messages[earlierIndex].id);
                    return;
                  }
                  setAnchorSession(sessionId);
                  try {
                    await onLoadEarlier?.();
                  } catch {
                    setEarlierErrorSession(sessionId);
                  } finally {
                    setAnchorSession((current) =>
                      current === sessionId ? null : current,
                    );
                  }
                }}
                type="button"
              >
                <UiIcon
                  icon={
                    loadingEarlierHistory || anchoredHistoryPending
                      ? LoaderCircle
                      : earlierHistoryError
                        ? AlertCircle
                        : ChevronUp
                  }
                  size="sm"
                />
                {loadingEarlierHistory || anchoredHistoryPending
                  ? "Loading earlier messages…"
                  : earlierHistoryError
                    ? "Retry loading earlier messages"
                    : "Load earlier messages"}
              </button>
              {earlierHistoryError ? (
                <p role="alert">Earlier messages could not be loaded.</p>
              ) : null}
            </div>
          ) : null}
          {rows}
        </>
      ) : (
        <Welcome
          onSelect={onSelectPrompt}
          projectName={projectName}
          botName={botName}
        />
      )}
      {showStandaloneProgress ? (
        <div className="chat-progress" role="status">
          <UiIcon icon={LoaderCircle} size="sm" />
          <span>{progress}</span>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
