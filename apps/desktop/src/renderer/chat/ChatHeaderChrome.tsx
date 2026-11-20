import { type ContextAction, ContextActionMenu } from "@doolittle/ui";
import { MoreHorizontal, PanelRight, Settings } from "lucide-react";
import type { RefObject } from "react";
import type { ChatSurface } from "../ChatPage";
import { UiIcon } from "../components/UiIcon";
import type { ChatSessionForRender } from "./useChatConversationState";

export interface ChatHeaderChromeProps {
  selectedId?: string;
  inspectorVisible: boolean;
  isNewConversation: boolean;
  onOpenWorkspace: () => void;
  onOpenSettings?: () => void;
  onSurfaceChange?: (surface: ChatSurface) => void;
  onToggleInspector: () => void;
  onTogglePin: () => void;
  selectedSession?: ChatSessionForRender;
  surface: ChatSurface;
  workbenchToggleRef: RefObject<HTMLButtonElement | null>;
}

/** The app supplies identity and title; this portal supplies only conversation actions. */
export function ChatHeaderChrome({
  selectedId,
  inspectorVisible,
  isNewConversation,
  onOpenWorkspace,
  onOpenSettings,
  onSurfaceChange,
  onToggleInspector,
  onTogglePin,
  selectedSession,
  surface,
  workbenchToggleRef,
}: ChatHeaderChromeProps) {
  const actions: ContextAction[] = [
    {
      id: "new-conversation",
      label: "New conversation",
      onSelect: () => window.dispatchEvent(new Event("doolittle:new-chat")),
    },
    {
      id: "workspace-views",
      label: "Workspace views",
      onSelect: () =>
        window.dispatchEvent(new Event("doolittle:workspace-views")),
    },
    {
      id: "history",
      label: "Conversation history",
      disabled: !onSurfaceChange,
      onSelect: () => onSurfaceChange?.("history"),
    },
    {
      id: "workspace",
      label: "Open full workspace",
      onSelect: onOpenWorkspace,
    },
  ];
  if (!isNewConversation && selectedSession) {
    actions.push({
      id: "pin",
      label: selectedSession.pinned ? "Unpin conversation" : "Pin conversation",
      onSelect: onTogglePin,
      separatorBefore: true,
    });
  }
  actions.push({
    id: "close-view",
    label: "Close view",
    separatorBefore: true,
    onSelect: () =>
      window.dispatchEvent(new Event("doolittle:close-conversation-view")),
  });
  return (
    <div className="flex h-full w-full items-center justify-end gap-1 [-webkit-app-region:no-drag]">
      <button
        aria-expanded={inspectorVisible}
        aria-label={inspectorVisible ? "Close inspector" : "Open inspector"}
        className="chat-header-action"
        onClick={onToggleInspector}
        ref={workbenchToggleRef}
        title={inspectorVisible ? "Close inspector" : "Open inspector"}
        type="button"
      >
        <UiIcon icon={PanelRight} size="sm" />
      </button>
      {onOpenSettings ? (
        <button
          aria-label="Open settings"
          className="chat-header-action"
          onClick={onOpenSettings}
          title="Settings"
          type="button"
        >
          <UiIcon icon={Settings} size="sm" />
        </button>
      ) : null}
      <ContextActionMenu
        label="Conversation options"
        items={actions}
        scopeKey={`${selectedId ?? "draft"}:${surface}`}
        trigger={
          <button
            aria-label="Conversation options"
            className="chat-header-action"
            title="Conversation options"
            type="button"
          >
            <UiIcon icon={MoreHorizontal} size="sm" />
          </button>
        }
      >
        {null}
      </ContextActionMenu>
    </div>
  );
}
