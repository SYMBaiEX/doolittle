import { type ContextAction, Button as ElizaButton } from "@doolittle/ui";
import { Check, Copy } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import type { BranchMode, CopyState, DisplayMessage } from "./models";

interface MessageActionsProps {
  message: DisplayMessage;
  backendReady: boolean;
  activeRequest: string | null;
  forkingMessageId: string;
  speechSupported: boolean;
  speakingMessageId: string;
  onBranch: (message: DisplayMessage, mode: BranchMode) => void;
  onCopy: (message: DisplayMessage) => void;
  onRead: (message: DisplayMessage) => void;
  onStopReading: () => void;
  onPromote?: (message: DisplayMessage) => void;
}

export function getMessageActions({
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
}: MessageActionsProps): ContextAction[] {
  const branchDisabled =
    !backendReady ||
    Boolean(activeRequest || forkingMessageId || message.pending) ||
    Boolean(message.error && message.role !== "assistant");
  const branch = (mode: BranchMode) => () => {
    if (!branchDisabled) onBranch(message, mode);
  };
  const items: ContextAction[] = [
    {
      id: "copy",
      label: "Copy message",
      onSelect: () => onCopy(message),
    },
    {
      id: "fork",
      label:
        forkingMessageId === message.id
          ? "Creating branch…"
          : "Fork from this message",
      disabled: branchDisabled || Boolean(message.error),
      onSelect: branch("fork"),
    },
  ];
  if (message.role === "user") {
    items.push({
      id: "edit",
      label: "Edit in a new branch",
      disabled: branchDisabled,
      onSelect: branch("edit"),
    });
  } else if (!message.pending) {
    items.push({
      id: "retry",
      label: "Retry in a new branch",
      disabled: branchDisabled,
      onSelect: branch("retry"),
    });
  }
  if (message.role === "assistant" && !message.pending && !message.error) {
    const speaking = speakingMessageId === message.id;
    const speechDisabled = !speechSupported || !message.content.trim();
    items.push({
      id: "read",
      label: speaking
        ? "Stop reading response"
        : speechSupported
          ? "Read response aloud"
          : "Read aloud is unavailable on this device",
      disabled: speechDisabled,
      separatorBefore: true,
      onSelect: () => {
        if (speechDisabled) return;
        if (speaking) onStopReading();
        else onRead(message);
      },
    });
  }
  if (onPromote && !message.pending && !message.error && message.runId) {
    items.push({
      id: "promote",
      label: "Save to project knowledge…",
      disabled: !backendReady,
      separatorBefore: true,
      onSelect: () => {
        if (backendReady) onPromote(message);
      },
    });
  }
  return items;
}

export function MessageCopyButton({
  copyState,
  onCopy,
}: {
  copyState?: CopyState;
  onCopy: () => void;
}) {
  const feedback =
    copyState === "copied"
      ? "Message copied"
      : copyState === "failed"
        ? "Copy failed"
        : "";
  return (
    <>
      <ElizaButton
        aria-label="Copy message"
        className="chat-turn-action"
        data-copy-state={copyState}
        onClick={onCopy}
        size="sm"
        title={feedback || "Copy message"}
        type="button"
        variant="ghost"
      >
        <UiIcon icon={copyState === "copied" ? Check : Copy} size="sm" />
      </ElizaButton>
      <span className="sr-only" role="status">
        {feedback}
      </span>
    </>
  );
}
