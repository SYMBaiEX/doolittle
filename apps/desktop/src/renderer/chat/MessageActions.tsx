import type { BranchMode, CopyState, DisplayMessage } from "./models";

export interface MessageActionsProps {
  message: DisplayMessage;
  backendReady: boolean;
  activeRequest: string | null;
  forkingMessageId: string;
  copyState?: CopyState;
  speechSupported: boolean;
  speakingMessageId: string;
  onBranch: (message: DisplayMessage, mode: BranchMode) => void;
  onCopy: (message: DisplayMessage) => void;
  onRead: (message: DisplayMessage) => void;
  onStopReading: () => void;
}

export function MessageActions({
  message,
  backendReady,
  activeRequest,
  forkingMessageId,
  copyState,
  speechSupported,
  speakingMessageId,
  onBranch,
  onCopy,
  onRead,
  onStopReading,
}: MessageActionsProps) {
  const label = copyState === "copied" ? "Copied" : "Copy";
  const failed = copyState === "failed";
  const branchDisabled =
    !backendReady ||
    Boolean(activeRequest) ||
    Boolean(message.pending) ||
    (Boolean(message.error) && message.role !== "assistant") ||
    Boolean(forkingMessageId);
  return (
    <div
      aria-label="Message actions"
      className="chat-message-actions"
      role="toolbar"
    >
      <button
        aria-label="Fork conversation from this message"
        disabled={branchDisabled}
        onClick={() => onBranch(message, "fork")}
        title="Keep this transcript unchanged and continue in a new branch"
        type="button"
      >
        {forkingMessageId === message.id ? "Branching…" : "Fork"}
      </button>
      {message.role === "user" ? (
        <button
          aria-label="Edit this message in a new branch"
          disabled={branchDisabled}
          onClick={() => onBranch(message, "edit")}
          title="Create a branch before this turn and restore the prompt for editing"
          type="button"
        >
          Edit
        </button>
      ) : !message.pending ? (
        <button
          aria-label="Retry this response in a new branch"
          disabled={branchDisabled}
          onClick={() => onBranch(message, "retry")}
          title="Regenerate the preceding prompt without deleting this response"
          type="button"
        >
          Retry
        </button>
      ) : null}
      {message.role === "assistant" && !message.pending && !message.error ? (
        <button
          aria-label={
            speechSupported
              ? speakingMessageId === message.id
                ? "Stop reading response"
                : "Read response aloud"
              : "Read aloud is unavailable on this device"
          }
          disabled={!speechSupported || !message.content.trim()}
          onClick={() =>
            speakingMessageId === message.id ? onStopReading() : onRead(message)
          }
          title={
            speechSupported
              ? undefined
              : "Read aloud is not supported by this system."
          }
          type="button"
        >
          {speakingMessageId === message.id ? "Stop" : "Read"}
        </button>
      ) : null}
      <button
        aria-label={failed ? "Copy failed" : "Copy message"}
        onClick={() => onCopy(message)}
        type="button"
      >
        {failed ? "Copy failed" : label}
      </button>
    </div>
  );
}
