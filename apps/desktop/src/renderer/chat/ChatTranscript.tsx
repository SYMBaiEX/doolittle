import { ContextActionMenu, StateSurface } from "@doolittle/ui";
import {
  memo,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatMessage } from "./ChatMessage";
import { getMessageActions, MessageActions } from "./MessageActions";
import type {
  BranchMode,
  CopyState,
  DisplayMessage,
  RunReceiptStore,
} from "./models";
import { Welcome } from "./Welcome";

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
>;

interface TranscriptMessageRowProps {
  botName?: string;
  activeRequest: string | null;
  backendReady: boolean;
  callbacks: RefObject<MessageCallbacks>;
  canPromote: boolean;
  canRetry: boolean;
  copyState?: CopyState;
  forkingMessageId: string;
  message: DisplayMessage;
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
  copyState,
  forkingMessageId,
  message,
  receipt,
  speakingMessageId,
  speechSupported,
}: TranscriptMessageRowProps) {
  const actions = getMessageActions({
    activeRequest,
    backendReady,
    copyState,
    forkingMessageId,
    message,
    onBranch: (value, mode) => callbacks.current.onBranch(value, mode),
    onCopy: (value) => callbacks.current.onCopy(value),
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
      label={
        message.role === "assistant" ? "Response actions" : "Message actions"
      }
      items={actions}
      scopeKey={message.id}
    >
      <ChatMessage
        botName={botName}
        actions={<MessageActions copyState={copyState} items={actions} />}
        message={message}
        onRetry={
          canRetry
            ? () => callbacks.current.onRetryMessage?.(message)
            : undefined
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
  onSelectPrompt,
  hasEarlierMessages = false,
  loadingEarlierHistory = false,
  onLoadEarlier,
}: ChatTranscriptProps) {
  const messageCallbacks = {
    onBranch,
    onCopy,
    onRead,
    onRetryMessage,
    onStopReading,
    onPromote,
  };
  const callbacks = useRef(messageCallbacks);
  useLayoutEffect(() => {
    // Row controls dispatch against the committed conversation, even when an
    // unchanged message skipped rendering during a draft or stream update.
    callbacks.current = messageCallbacks;
  });
  const canPromote = Boolean(onPromote);
  const canRetry = Boolean(onRetryMessage);
  const rows = useMemo(
    () =>
      messages.map((message) => {
        const runId = messageRunId(message);
        return (
          <TranscriptMessageRow
            botName={botName}
            activeRequest={activeRequest}
            backendReady={backendReady}
            callbacks={callbacks}
            canPromote={canPromote}
            canRetry={canRetry}
            copyState={copyStates[message.id]}
            forkingMessageId={forkingMessageId}
            key={message.id}
            message={message}
            receipt={runId ? runReceipts[runId] : undefined}
            speakingMessageId={speakingMessageId}
            speechSupported={speechSupported}
          />
        );
      }),
    [
      messages,
      botName,
      activeRequest,
      backendReady,
      canPromote,
      canRetry,
      copyStates,
      forkingMessageId,
      runReceipts,
      speakingMessageId,
      speechSupported,
    ],
  );
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [anchorSession, setAnchorSession] = useState<string | null>(null);
  const [earlierErrorSession, setEarlierErrorSession] = useState<string | null>(
    null,
  );
  const earlierHistoryError = earlierErrorSession === sessionId;
  const anchoredHistoryPending = anchorSession === sessionId;
  const historyAnchorRef = useRef<{
    sessionId: string;
    messageId: string;
    row: Element;
    contentTop: number;
    focusedTrigger: HTMLButtonElement | null;
  } | null>(null);

  useLayoutEffect(() => {
    const anchor = historyAnchorRef.current;
    const transcript = transcriptRef.current;
    if (!anchor || !transcript) return;

    if (anchor.sessionId === sessionId && anchor.row.isConnected) {
      if (messages[0]?.id !== anchor.messageId) {
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
  }, [anchoredHistoryPending, loadingEarlierHistory, messages, sessionId]);

  const latestMessage = messages.at(-1);
  const latestRunId = latestMessage ? messageRunId(latestMessage) : undefined;
  const showStandaloneProgress = Boolean(
    progress &&
      (!activeRequest ||
        !latestRunId ||
        latestRunId !== activeRequest ||
        !runReceipts[latestRunId]),
  );

  return (
    <div
      aria-busy={loading || undefined}
      aria-relevant="additions"
      aria-label={projectName ? `${projectName} conversation` : "Conversation"}
      className="chat-messages"
      ref={transcriptRef}
      role="log"
      tabIndex={-1}
    >
      {loading && !messages.length ? (
        <StateSurface kind="loading" title="Loading conversation…" />
      ) : historyError && !messages.length ? (
        <StateSurface
          kind="error"
          action={
            <button
              className="text-button"
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
            <p className="chat-history-notice" role="status">
              Refreshing conversation…
            </p>
          ) : historyError ? (
            <div className="chat-history-notice" role="alert">
              <span>History could not be refreshed. {historyError}</span>
              <button
                className="text-button"
                onClick={onRetryHistory}
                type="button"
              >
                Retry history
              </button>
            </div>
          ) : null}
          {hasEarlierMessages && onLoadEarlier ? (
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
                className="text-button"
                disabled={loadingEarlierHistory || anchoredHistoryPending}
                onClick={async (event) => {
                  const transcript = transcriptRef.current;
                  const row = transcript?.querySelector("[data-message-role]");
                  const firstMessage = messages[0];
                  if (transcript && row && firstMessage) {
                    // Apply only the displacement caused by prepended rows.
                    // The reader can keep scrolling while history loads.
                    transcript.style.setProperty("overflow-anchor", "none");
                    historyAnchorRef.current = {
                      sessionId,
                      messageId: firstMessage.id,
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
                  setAnchorSession(sessionId);
                  setEarlierErrorSession(null);
                  try {
                    await onLoadEarlier();
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
        <div aria-live="polite" className="chat-progress" role="status">
          <i />
          <span>{progress}</span>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
