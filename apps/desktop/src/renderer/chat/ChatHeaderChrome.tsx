import { MoreHorizontal, PanelRight, Search } from "lucide-react";
import type { RefObject } from "react";
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
  modelRouteLabel,
  onOpenRouteControls,
  onOpenWorkspace,
  onPrepareCompression,
  onSurfaceChange,
  onToggleInspector,
  onOpenInspectorTab,
  onTogglePin,
  selectedSession,
  workbenchToggleRef,
}: ChatHeaderChromeProps) {
  return (
    <div className="flex h-full w-full items-center justify-end gap-1 [-webkit-app-region:no-drag]">
      <button
        aria-label="Find conversation"
        className="grid size-10 place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:size-11"
        onClick={() =>
          window.dispatchEvent(new Event("doolittle:find-session"))
        }
        title="Find conversation"
        type="button"
      >
        <UiIcon icon={Search} size="sm" />
      </button>
      <button
        aria-expanded={inspectorVisible}
        aria-label={inspectorVisible ? "Close details" : "Open details"}
        className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:min-h-11"
        onClick={onToggleInspector}
        ref={workbenchToggleRef}
        type="button"
      >
        <UiIcon icon={PanelRight} size="sm" />
        <span className="max-[640px]:sr-only">Details</span>
      </button>
      <details
        className="relative"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.open = false;
          }
        }}
      >
        <summary
          aria-label="Conversation options"
          className="grid size-10 cursor-pointer list-none place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[760px]:size-11"
        >
          <UiIcon icon={MoreHorizontal} size="sm" />
        </summary>
        <div className="absolute right-0 z-70 mt-1 grid w-52 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1 shadow-[var(--shell-shadow-md)] [&>button]:min-h-10 [&>button]:rounded-[var(--radius-sm)] [&>button]:px-2 [&>button]:text-left [&>button]:text-sm [&>button:hover]:bg-[var(--surface-hover)]">
          <button onClick={() => onSurfaceChange?.("history")} type="button">
            Conversation history
          </button>
          <button onClick={() => onOpenInspectorTab?.("library")} type="button">
            Library
          </button>
          <button
            onClick={() => onOpenInspectorTab?.("computer")}
            type="button"
          >
            Computer
          </button>
          <button onClick={onOpenWorkspace} type="button">
            Open full workspace
          </button>
          {!isNewConversation && selectedSession ? (
            <button onClick={onTogglePin} type="button">
              {selectedSession.pinned
                ? "Unpin conversation"
                : "Pin conversation"}
            </button>
          ) : null}
          <button
            onClick={() =>
              window.dispatchEvent(
                new Event("doolittle:close-conversation-view"),
              )
            }
            type="button"
          >
            Close view
          </button>
          <button
            aria-label={`Model options. Current route ${modelRouteLabel}`}
            onClick={onOpenRouteControls}
            type="button"
          >
            Model options
          </button>
          <button onClick={onPrepareCompression} type="button">
            Prepare context compression
          </button>
        </div>
      </details>
    </div>
  );
}
