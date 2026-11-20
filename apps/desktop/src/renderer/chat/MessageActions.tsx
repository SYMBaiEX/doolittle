import { type ContextAction, Button as ElizaButton } from "@doolittle/ui";
import {
  BookmarkPlus,
  Check,
  Copy,
  GitFork,
  type LucideIcon,
  Pencil,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import type { BranchMode, CopyState, DisplayMessage } from "./models";

interface MessageActionsProps {
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

interface MessageAction extends ContextAction {
  icon: LucideIcon;
  buttonLabel?: string;
  title?: string;
  tone?: "success" | "error";
}

export function getMessageActions({
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
}: MessageActionsProps): MessageAction[] {
  const branchDisabled =
    !backendReady ||
    Boolean(activeRequest || forkingMessageId || message.pending) ||
    Boolean(message.error && message.role !== "assistant");
  const branch = (mode: BranchMode) => () => {
    if (!branchDisabled) onBranch(message, mode);
  };
  const items: MessageAction[] = [
    {
      id: "copy",
      label: "Copy message",
      buttonLabel: copyState === "failed" ? "Copy failed" : undefined,
      icon: copyState === "copied" ? Check : Copy,
      title: copyState === "copied" ? "Copied" : undefined,
      tone:
        copyState === "copied"
          ? "success"
          : copyState === "failed"
            ? "error"
            : undefined,
      onSelect: () => onCopy(message),
    },
    {
      id: "fork",
      icon: GitFork,
      label: "Fork from this message",
      buttonLabel: "Fork conversation from this message",
      title:
        forkingMessageId === message.id
          ? "Creating branch…"
          : "Continue in a new branch from this message",
      disabled: branchDisabled || Boolean(message.error),
      onSelect: branch("fork"),
    },
  ];
  if (message.role === "user") {
    items.push({
      id: "edit",
      icon: Pencil,
      label: "Edit in a new branch",
      buttonLabel: "Edit this message in a new branch",
      disabled: branchDisabled,
      onSelect: branch("edit"),
    });
  } else if (!message.pending) {
    items.push({
      id: "retry",
      icon: RotateCcw,
      label: "Retry in a new branch",
      buttonLabel: "Retry this response in a new branch",
      disabled: branchDisabled,
      onSelect: branch("retry"),
    });
  }
  if (message.role === "assistant" && !message.pending && !message.error) {
    const speaking = speakingMessageId === message.id;
    const speechDisabled = !speechSupported || !message.content.trim();
    items.push({
      id: "read",
      icon: speaking ? VolumeX : Volume2,
      label: speaking ? "Stop reading response" : "Read response aloud",
      buttonLabel: speechSupported
        ? undefined
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
      icon: BookmarkPlus,
      label: "Save to project knowledge…",
      buttonLabel: "Promote message to project knowledge",
      title: "Save to project knowledge; sharing requires a separate grant",
      disabled: !backendReady,
      separatorBefore: true,
      onSelect: () => {
        if (backendReady) onPromote(message);
      },
    });
  }
  return items;
}

export function MessageActions({
  items,
  copyState,
}: {
  items: MessageAction[];
  copyState?: CopyState;
}) {
  return (
    <fieldset aria-label="Message actions" className="chat-message-actions">
      {items.map((item) => (
        <ElizaButton
          aria-label={item.buttonLabel ?? item.label}
          className="chat-message-action-button"
          data-tone={item.tone}
          disabled={item.disabled}
          key={item.id}
          onClick={item.onSelect}
          size="sm"
          title={item.title ?? item.buttonLabel ?? item.label}
          type="button"
          variant="ghost"
        >
          <UiIcon icon={item.icon} size="xs" />
        </ElizaButton>
      ))}
      <span className="sr-only" role="status">
        {copyState === "copied"
          ? "Message copied"
          : copyState === "failed"
            ? "Copy failed"
            : ""}
      </span>
    </fieldset>
  );
}
