import { Button as ElizaButton } from "@elizaos/ui/components/ui/button";
import type { BranchMode, CopyState, DisplayMessage } from "./models";

const MESSAGE_ACTION_CLASS =
  "chat-message-action-button !min-h-[26px] !rounded-[5px] !border-0 !bg-transparent px-[7px] py-1 !text-[10px] !leading-[1.1] !text-[var(--muted)] hover:!bg-[var(--surface-hover)] hover:!text-[var(--text)] focus-visible:!bg-[var(--surface-hover)] focus-visible:!text-[var(--text)] motion-reduce:transition-none";

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
      className="chat-message-actions pointer-coarse:pointer-events-auto pointer-coarse:translate-y-0 pointer-coarse:opacity-100 pointer-fine:pointer-events-none pointer-fine:translate-y-0.5 pointer-fine:opacity-0 pointer-fine:transition-[opacity,transform] pointer-fine:duration-150 pointer-fine:group-hover:pointer-events-auto pointer-fine:group-hover:translate-y-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:pointer-events-auto pointer-fine:focus-within:translate-y-0 pointer-fine:focus-within:opacity-100 static flex min-w-0 max-w-full flex-wrap items-center justify-end gap-0.5 motion-reduce:transition-none motion-reduce:transform-none"
      role="toolbar"
    >
      <ElizaButton
        className={MESSAGE_ACTION_CLASS}
        aria-label="Fork conversation from this message"
        disabled={branchDisabled}
        onClick={() => onBranch(message, "fork")}
        title="Keep this transcript unchanged and continue in a new branch"
        type="button"
        size="sm"
        variant="ghost"
      >
        {forkingMessageId === message.id ? "Branching…" : "Fork"}
      </ElizaButton>
      {message.role === "user" ? (
        <ElizaButton
          className={MESSAGE_ACTION_CLASS}
          aria-label="Edit this message in a new branch"
          disabled={branchDisabled}
          onClick={() => onBranch(message, "edit")}
          title="Create a branch before this turn and restore the prompt for editing"
          type="button"
          size="sm"
          variant="ghost"
        >
          Edit
        </ElizaButton>
      ) : !message.pending ? (
        <ElizaButton
          className={MESSAGE_ACTION_CLASS}
          aria-label="Retry this response in a new branch"
          disabled={branchDisabled}
          onClick={() => onBranch(message, "retry")}
          title="Regenerate the preceding prompt without deleting this response"
          type="button"
          size="sm"
          variant="ghost"
        >
          Retry
        </ElizaButton>
      ) : null}
      {message.role === "assistant" && !message.pending && !message.error ? (
        <ElizaButton
          className={MESSAGE_ACTION_CLASS}
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
          size="sm"
          variant="ghost"
        >
          {speakingMessageId === message.id ? "Stop" : "Read"}
        </ElizaButton>
      ) : null}
      <ElizaButton
        className={MESSAGE_ACTION_CLASS}
        aria-label={failed ? "Copy failed" : "Copy message"}
        onClick={(event) => {
          onCopy(message);
          if (event.detail > 0) event.currentTarget.blur();
        }}
        type="button"
        size="sm"
        variant="ghost"
      >
        {failed ? "Copy failed" : label}
      </ElizaButton>
    </div>
  );
}
