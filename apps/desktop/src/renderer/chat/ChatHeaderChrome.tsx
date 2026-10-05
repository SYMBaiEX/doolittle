import { MoreHorizontal, PanelRight, Settings } from "lucide-react";
import { type RefObject, useRef } from "react";
import type { ChatSurface } from "../ChatPage";
import { UiIcon } from "../components/UiIcon";
import type { ContextPressureTone } from "../context-pressure";
import type { ChatSessionForRender } from "./useChatConversationState";

export interface ChatHeaderChromeProps {
  selectedId?: string;
  inspectorVisible: boolean;
  isNewConversation: boolean;
  mobileConversationsButtonRef: RefObject<HTMLButtonElement | null>;
  mobileConversationsOpen: boolean;
  modelRouteLabel: string;
  onOpenMobileConversations: () => void;
  onOpenRouteControls: () => void;
  onOpenWorkspace: () => void;
  onOpenSettings?: () => void;
  onPrepareCompression: () => void;
  onSurfaceChange?: (surface: ChatSurface) => void;
  onToggleInspector: () => void;
  onOpenInspectorTab?: (tab: "details" | "library" | "computer") => void;
  onTogglePin: () => void;
  selectedContextLabel: string;
  selectedContextPercent: number;
  selectedContextTone: ContextPressureTone;
  selectedMessageCount: number;
  selectedSession?: ChatSessionForRender;
  selectedUpdatedAt?: string;
  selectedUsageError?: string;
  sessionsCount: number;
  surface: ChatSurface;
  workbenchToggleRef: RefObject<HTMLButtonElement | null>;
  workspacePath: string;
}

/** The app supplies identity and title; this portal supplies only conversation actions. */
export function ChatHeaderChrome({
  inspectorVisible,
  isNewConversation,
  onOpenWorkspace,
  onOpenSettings,
  onSurfaceChange,
  onToggleInspector,
  onTogglePin,
  selectedSession,
  workbenchToggleRef,
}: ChatHeaderChromeProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const selectAction = (action: () => void) => {
    if (menuRef.current) {
      menuRef.current.open = false;
      menuRef.current.querySelector("summary")?.focus();
    }
    action();
  };
  return (
    <div className="flex h-full w-full items-center justify-end gap-1 [-webkit-app-region:no-drag]">
      <button
        aria-expanded={inspectorVisible}
        aria-label={inspectorVisible ? "Close inspector" : "Open inspector"}
        className="grid size-10 place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:size-11"
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
          className="grid size-10 place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:size-11"
          onClick={onOpenSettings}
          title="Settings"
          type="button"
        >
          <UiIcon icon={Settings} size="sm" />
        </button>
      ) : null}
      <details
        ref={menuRef}
        className="relative"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          aria-label="Conversation options"
          className="grid size-10 cursor-pointer list-none place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:size-11"
        >
          <UiIcon icon={MoreHorizontal} size="sm" />
        </summary>
        <div className="absolute right-0 z-70 mt-1 grid w-52 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1 shadow-[var(--shell-shadow-md)] [&>button]:min-h-10 [&>button]:rounded-[var(--radius-sm)] [&>button]:px-2 [&>button]:text-left [&>button]:text-[length:var(--text-control)] [&>button:hover]:bg-[var(--surface-hover)] max-[760px]:[&>button]:min-h-11">
          <button
            onClick={() =>
              selectAction(() =>
                window.dispatchEvent(
                  new Event("doolittle:new-conversation-view"),
                ),
              )
            }
            type="button"
          >
            New conversation
          </button>
          <button
            onClick={() => selectAction(() => onSurfaceChange?.("history"))}
            type="button"
          >
            Conversation history
          </button>
          <button onClick={() => selectAction(onOpenWorkspace)} type="button">
            Open full workspace
          </button>
          {!isNewConversation && selectedSession ? (
            <button onClick={() => selectAction(onTogglePin)} type="button">
              {selectedSession.pinned
                ? "Unpin conversation"
                : "Pin conversation"}
            </button>
          ) : null}
          <button
            onClick={() =>
              selectAction(() =>
                window.dispatchEvent(
                  new Event("doolittle:close-conversation-view"),
                ),
              )
            }
            type="button"
          >
            Close view
          </button>
        </div>
      </details>
    </div>
  );
}
