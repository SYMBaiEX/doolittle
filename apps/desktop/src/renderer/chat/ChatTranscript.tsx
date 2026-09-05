import { memo, type RefObject } from "react";
import { EmptyBlock } from "../lib";
import { ChatMessage } from "./ChatMessage";
import { MessageActions } from "./MessageActions";
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
  onStopReading: () => void;
  onSelectPrompt: (prompt: string) => void;
  hasEarlierMessages?: boolean;
  loadingEarlierHistory?: boolean;
  onLoadEarlier?: () => Promise<void> | void;
}

interface TranscriptMessageRowProps {
  activeRequest: string | null;
  backendReady: boolean;
  copyState?: CopyState;
  forkingMessageId: string;
  message: DisplayMessage;
  onBranch: (message: DisplayMessage, mode: BranchMode) => void;
  onCopy: (message: DisplayMessage) => void;
  onRead: (message: DisplayMessage) => void;
  onStopReading: () => void;
  receipt: RunReceiptStore[string] | undefined;
  speakingMessageId: string;
  speechSupported: boolean;
}

const TranscriptMessageRow = memo(
  function TranscriptMessageRow({
    activeRequest,
    backendReady,
    copyState,
    forkingMessageId,
    message,
    onBranch,
    onCopy,
    onRead,
    onStopReading,
    receipt,
    speakingMessageId,
    speechSupported,
  }: TranscriptMessageRowProps) {
    return (
      <ChatMessage
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
            speakingMessageId={speakingMessageId}
            speechSupported={speechSupported}
          />
        }
        message={message}
        receipt={receipt}
      />
    );
  },
  (previous, next) =>
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
    previous.onStopReading === next.onStopReading,
);

export function ChatTranscript({
  loading,
  historyError,
  messages,
  runReceipts,
  progress,
  projectName,
  endRef,
  backendReady,
  activeRequest,
  forkingMessageId,
  copyStates,
  speechSupported,
  speakingMessageId,
  onBranch,
  onCopy,
  onRead,
  onRetryHistory,
  onStopReading,
  onSelectPrompt,
  hasEarlierMessages = false,
  loadingEarlierHistory = false,
  onLoadEarlier,
}: ChatTranscriptProps) {
  const latestMessage = messages.at(-1);
  const latestRunReceipt = latestMessage?.id.startsWith("assistant:")
    ? runReceipts[latestMessage.id.slice("assistant:".length)]
    : undefined;
  const showStandaloneProgress = Boolean(progress && !latestRunReceipt);

  return (
    <div
      aria-busy={loading || Boolean(activeRequest)}
      aria-label={projectName ? `${projectName} conversation` : "Conversation"}
      className="chat-messages"
      role="log"
    >
      {loading ? (
        <div className="chat-loading">
          <i />
          Loading conversation…
        </div>
      ) : historyError ? (
        <EmptyBlock
          actions={
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
        </EmptyBlock>
      ) : messages.length ? (
        <>
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
              activeRequest={activeRequest}
              backendReady={backendReady}
              copyState={copyStates[message.id]}
              forkingMessageId={forkingMessageId}
              key={message.id}
              message={message}
              onBranch={onBranch}
              onCopy={onCopy}
              onRead={onRead}
              onStopReading={onStopReading}
              receipt={
                message.id.startsWith("assistant:")
                  ? runReceipts[message.id.slice("assistant:".length)]
                  : undefined
              }
              speakingMessageId={speakingMessageId}
              speechSupported={speechSupported}
            />
          ))}
        </>
      ) : (
        <Welcome onSelect={onSelectPrompt} projectName={projectName} />
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
