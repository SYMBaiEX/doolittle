import type { RefObject } from "react";
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
  onStopReading: () => void;
  onSelectPrompt: (prompt: string) => void;
}

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
  onStopReading,
  onSelectPrompt,
}: ChatTranscriptProps) {
  return (
    <div className="chat-messages">
      {loading ? (
        <div className="chat-loading">
          <i />
          Loading conversation…
        </div>
      ) : historyError ? (
        <EmptyBlock title="Conversation unavailable">{historyError}</EmptyBlock>
      ) : messages.length ? (
        messages.map((message) => (
          <ChatMessage
            actions={
              <MessageActions
                activeRequest={activeRequest}
                backendReady={backendReady}
                copyState={copyStates[message.id]}
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
            key={message.id}
            message={message}
            receipt={
              message.id.startsWith("assistant:")
                ? runReceipts[message.id.slice("assistant:".length)]
                : undefined
            }
          />
        ))
      ) : (
        <Welcome onSelect={onSelectPrompt} projectName={projectName} />
      )}
      {progress ? (
        <div className="chat-progress">
          <i />
          {progress}
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
