import { type ContextAction, Button as ElizaButton } from "@doolittle/ui";
import {
  BookmarkPlus,
  Check,
  Copy,
  GitFork,
  Pencil,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import type { BranchMode, CopyState, DisplayMessage } from "./models";

const MESSAGE_ACTION_CLASS =
  "chat-message-action-button !size-10 !min-h-10 !min-w-10 max-[760px]:!size-11 max-[760px]:!min-h-11 max-[760px]:!min-w-11 !border-0 !bg-transparent !p-0 !text-[var(--muted)] hover:!bg-[var(--surface-hover)] hover:!text-[var(--text)] focus-visible:!bg-[var(--surface-hover)] focus-visible:!text-[var(--text)] motion-reduce:transition-none";

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
  onPromote?: (message: DisplayMessage) => void;
}

function isBranchDisabled(props: MessageActionsProps): boolean {
  return (
    !props.backendReady ||
    Boolean(props.activeRequest) ||
    Boolean(props.message.pending) ||
    (Boolean(props.message.error) && props.message.role !== "assistant") ||
    Boolean(props.forkingMessageId)
  );
}

/** Context menus reuse exactly the same owned actions and guards as the toolbar. */
export function messageContextActions(
  props: MessageActionsProps,
): ContextAction[] {
  const { message } = props;
  const branchDisabled = isBranchDisabled(props);
  const branch = (mode: BranchMode) => {
    if (!isBranchDisabled(props)) props.onBranch(message, mode);
  };
  const items: ContextAction[] = [
    {
      id: "copy",
      label: "Copy message",
      onSelect: () => props.onCopy(message),
    },
    {
      id: "fork",
      label: "Fork from this message",
      disabled: branchDisabled,
      onSelect: () => branch("fork"),
    },
  ];
  if (message.role === "user") {
    items.push({
      id: "edit",
      label: "Edit in a new branch",
      disabled: branchDisabled,
      onSelect: () => branch("edit"),
    });
  } else if (!message.pending) {
    items.push({
      id: "retry",
      label: "Retry in a new branch",
      disabled: branchDisabled,
      onSelect: () => branch("retry"),
    });
  }
  if (message.role === "assistant" && !message.pending && !message.error) {
    const speaking = props.speakingMessageId === message.id;
    const speechDisabled = !props.speechSupported || !message.content.trim();
    items.push({
      id: "read",
      label: speaking ? "Stop reading response" : "Read response aloud",
      disabled: speechDisabled,
      separatorBefore: true,
      onSelect: () => {
        if (speechDisabled) return;
        if (speaking) props.onStopReading();
        else props.onRead(message);
      },
    });
  }
  if (props.onPromote && !message.pending && !message.error && message.runId) {
    items.push({
      id: "promote",
      label: "Save to project knowledge…",
      disabled: !props.backendReady,
      separatorBefore: true,
      onSelect: () => {
        if (props.backendReady) props.onPromote?.(message);
      },
    });
  }
  return items;
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
  onPromote,
}: MessageActionsProps) {
  const label = copyState === "copied" ? "Copied" : "Copy";
  const failed = copyState === "failed";
  const branchDisabled = isBranchDisabled({
    message,
    backendReady,
    activeRequest,
    forkingMessageId,
    speechSupported,
    speakingMessageId,
    onBranch,
    onCopy,
    onRead,
    onStopReading,
    onPromote,
  });
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
        <UiIcon icon={GitFork} size="xs" />
        <span className="sr-only">
          {forkingMessageId === message.id ? "Branching…" : "Fork"}
        </span>
      </ElizaButton>
      {onPromote && !message.pending && !message.error && message.runId ? (
        <ElizaButton
          className={MESSAGE_ACTION_CLASS}
          aria-label="Promote message to project knowledge"
          title="Save this message as project knowledge; sharing requires a separate grant"
          disabled={!backendReady}
          onClick={() => onPromote(message)}
          type="button"
          variant="ghost"
        >
          <UiIcon icon={BookmarkPlus} size="xs" />
        </ElizaButton>
      ) : null}
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
          <UiIcon icon={Pencil} size="xs" />
          <span className="sr-only">Edit</span>
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
          <UiIcon icon={RotateCcw} size="xs" />
          <span className="sr-only">Retry</span>
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
              ? speakingMessageId === message.id
                ? "Stop reading response"
                : "Read response aloud"
              : "Read aloud is not supported by this system."
          }
          type="button"
          size="sm"
          variant="ghost"
        >
          <UiIcon
            icon={speakingMessageId === message.id ? VolumeX : Volume2}
            size="xs"
          />
          <span className="sr-only">
            {speakingMessageId === message.id ? "Stop" : "Read"}
          </span>
        </ElizaButton>
      ) : null}
      <ElizaButton
        className={MESSAGE_ACTION_CLASS}
        aria-label={failed ? "Copy failed" : "Copy message"}
        title={failed ? "Copy failed" : label}
        onClick={(event) => {
          onCopy(message);
          if (event.detail > 0) event.currentTarget.blur();
        }}
        type="button"
        size="sm"
        variant="ghost"
      >
        <UiIcon icon={copyState === "copied" ? Check : Copy} size="xs" />
        <span className="sr-only">{failed ? "Copy failed" : label}</span>
      </ElizaButton>
    </div>
  );
}
