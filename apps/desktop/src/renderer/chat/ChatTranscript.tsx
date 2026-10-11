import { ContextActionMenu, StateSurface } from "@doolittle/ui";
import { memo, type RefObject } from "react";
import { ChatMessage } from "./ChatMessage";
import { MessageActions, messageContextActions } from "./MessageActions";
import type {
  BranchMode,
  CopyState,
  DisplayMessage,
  RunReceiptStore,
} from "./models";
import { Welcome } from "./Welcome";

export interface ChatTranscriptProps {
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

interface TranscriptMessageRowProps {
  botName?: string;
  activeRequest: string | null;
  backendReady: boolean;
  copyState?: CopyState;
  forkingMessageId: string;
  message: DisplayMessage;
  onBranch: (message: DisplayMessage, mode: BranchMode) => void;
  onCopy: (message: DisplayMessage) => void;
  onRead: (message: DisplayMessage) => void;
  onRetryMessage?: (message: DisplayMessage) => void;
  onStopReading: () => void;
  onPromote?: (message: DisplayMessage) => void;
  receipt: RunReceiptStore[string] | undefined;
  speakingMessageId: string;
  speechSupported: boolean;
}

const TranscriptMessageRow = memo(
  function TranscriptMessageRow({
    botName,
    activeRequest,
    backendReady,
    copyState,
    forkingMessageId,
    message,
    onBranch,
    onCopy,
    onRead,
    onStopReading,
    onPromote,
    onRetryMessage,
    receipt,
    speakingMessageId,
    speechSupported,
  }: TranscriptMessageRowProps) {
    const contextActions = messageContextActions({
      activeRequest,
      backendReady,
      copyState,
      forkingMessageId,
      message,
      onBranch,
      onCopy,
      onRead,
      onStopReading,
      onPromote,
      speakingMessageId,
      speechSupported,
    });
    return (
      <ContextActionMenu
        label={
          message.role === "assistant" ? "Response actions" : "Message actions"
        }
        items={contextActions}
        scopeKey={message.id}
      >
        <ChatMessage
          botName={botName}
          actions={
            <MessageActions
              activeRequest={activeRequest}
              backendReady={backendReady}
              copyState={copyState}
              forkingMessageId={forkingMessageId}
              message={message}
              onBranch={onBranch}
              onCopy={onCopy}
              onRead={onRead}
              onStopReading={onStopReading}
              onPromote={onPromote}
              speakingMessageId={speakingMessageId}
              speechSupported={speechSupported}
            />
          }
          message={message}
          onRetry={onRetryMessage ? () => onRetryMessage(message) : undefined}
          receipt={receipt}
          retryDisabled={
            !backendReady || Boolean(activeRequest) || Boolean(forkingMessageId)
          }
        />
      </ContextActionMenu>
    );
  },
  (previous, next) =>
    previous.botName === next.botName &&
    previous.activeRequest === next.activeRequest &&
    previous.backendReady === next.backendReady &&
    previous.copyState === next.copyState &&
    previous.forkingMessageId === next.forkingMessageId &&
    previous.message === next.message &&
    previous.receipt === next.receipt &&
    previous.speakingMessageId === next.speakingMessageId &&
    previous.speechSupported === next.speechSupported &&
    previous.onBranch === next.onBranch &&
    previous.onCopy === next.onCopy &&
    previous.onRead === next.onRead &&
    previous.onStopReading === next.onStopReading &&
    previous.onPromote === next.onPromote &&
    previous.onRetryMessage === next.onRetryMessage,
);

export function ChatTranscript({
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
  const latestMessage = messages.at(-1);
  const latestRunId =
    latestMessage?.role === "assistant"
      ? (latestMessage.runId ??
        (latestMessage.id.startsWith("assistant:")
          ? latestMessage.id.slice("assistant:".length)
          : undefined))
      : undefined;
  const latestRunReceipt = latestRunId ? runReceipts[latestRunId] : undefined;
  const showStandaloneProgress = Boolean(progress && !latestRunReceipt);

  return (
    <div
      aria-busy={loading || undefined}
      aria-relevant="additions"
      aria-label={projectName ? `${projectName} conversation` : "Conversation"}
      className="chat-messages"
      role="log"
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
                aria-label="Load earlier messages"
                className="text-button"
                disabled={loadingEarlierHistory}
                onClick={async (event) => {
                  const transcript =
                    event.currentTarget.closest<HTMLElement>(".chat-messages");
                  const previousHeight = transcript?.scrollHeight ?? 0;
                  const previousTop = transcript?.scrollTop ?? 0;
                  await onLoadEarlier();
                  if (transcript) {
                    transcript.scrollTop =
                      previousTop + (transcript.scrollHeight - previousHeight);
                  }
                }}
                type="button"
              >
                {loadingEarlierHistory
                  ? "Loading earlier messages…"
                  : "Load earlier messages"}
              </button>
            </div>
          ) : null}
          {messages.map((message) => (
            <TranscriptMessageRow
              botName={botName}
              activeRequest={activeRequest}
              backendReady={backendReady}
              copyState={copyStates[message.id]}
              forkingMessageId={forkingMessageId}
              key={message.id}
              message={message}
              onBranch={onBranch}
              onCopy={onCopy}
              onPromote={onPromote}
              onRead={onRead}
              onRetryMessage={onRetryMessage}
              onStopReading={onStopReading}
              receipt={
                message.role === "assistant" &&
                (message.runId || message.id.startsWith("assistant:"))
                  ? runReceipts[
                      message.runId ?? message.id.slice("assistant:".length)
                    ]
                  : undefined
              }
              speakingMessageId={speakingMessageId}
              speechSupported={speechSupported}
            />
          ))}
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
