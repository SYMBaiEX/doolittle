import { ChevronDown, Code2, PanelRight, Pin } from "lucide-react";
import type { RefObject } from "react";
import type { ChatSurface } from "../ChatPage";
import { UiIcon } from "../components/UiIcon";
import type { ContextPressureTone } from "../context-pressure";
import { displayTimestamp } from "../lib";
import { compactSessionPreview } from "../session-preview";
import { CHAT_HEADER_CONTENT_CLASS } from "./layout";
import type { ChatSessionForRender } from "./useChatConversationState";

export interface ChatHeaderChromeProps {
  activeRequest: string | null;
  inspectorVisible: boolean;
  isNewConversation: boolean;
  mobileConversationsButtonRef: RefObject<HTMLButtonElement | null>;
  mobileConversationsOpen: boolean;
  modelRouteLabel: string;
  onCancelRequest: (requestId: string) => void;
  onOpenMobileConversations: () => void;
  onOpenProjectManager?: () => void;
  onOpenRouteControls: () => void;
  onOpenWorkspace: () => void;
  onPrepareCompression: () => void;
  onSurfaceChange?: (surface: ChatSurface) => void;
  onToggleInspector: () => void;
  onTogglePin: () => void;
  selectedContextLabel: string;
  selectedContextPercent: number;
  selectedContextTone: ContextPressureTone;
  selectedMessageCount: number;
  projectName?: string;
  selectedSession?: ChatSessionForRender;
  selectedUpdatedAt?: string;
  selectedUsageError?: string;
  sessionsCount: number;
  surface: ChatSurface;
  workbenchToggleRef: RefObject<HTMLButtonElement | null>;
  workspacePath: string;
}

export function ChatHeaderChrome({
  activeRequest,
  inspectorVisible,
  isNewConversation,
  mobileConversationsButtonRef,
  mobileConversationsOpen,
  modelRouteLabel,
  onCancelRequest,
  onOpenMobileConversations,
  onOpenProjectManager,
  onOpenRouteControls,
  onOpenWorkspace,
  onPrepareCompression,
  onSurfaceChange,
  onToggleInspector,
  onTogglePin,
  selectedContextLabel,
  selectedContextPercent,
  selectedContextTone,
  selectedMessageCount,
  projectName,
  selectedSession,
  selectedUpdatedAt,
  selectedUsageError,
  sessionsCount,
  surface,
  workbenchToggleRef,
  workspacePath,
}: ChatHeaderChromeProps) {
  const showConversationState = !isNewConversation;
  const conversationTitle = selectedSession
    ? compactSessionPreview(selectedSession.title ?? "") ||
      "Untitled conversation"
    : "New conversation";
  const scopeLabel = projectName?.trim() || "General";

  return (
    <div className={CHAT_HEADER_CONTENT_CLASS}>
      <div className="chat-header-mainline">
        <nav aria-label="Conversation breadcrumb" className="chat-breadcrumbs">
          <ol>
            <li>
              <button
                onClick={() => onSurfaceChange?.("conversation")}
                type="button"
              >
                Chat
              </button>
            </li>
            <li className="chat-breadcrumb-project">
              <button
                onClick={onOpenProjectManager}
                title={`Current project scope: ${scopeLabel}. Change project.`}
                type="button"
              >
                {scopeLabel}
              </button>
            </li>
            <li aria-current="page" className="chat-breadcrumb-current">
              <h2 title={selectedSession ? conversationTitle : undefined}>
                {conversationTitle}
              </h2>
            </li>
          </ol>
        </nav>
        <div className="chat-session-meta-wrap">
          <div className="chat-session-meta">
            {selectedSession?.parentSessionId ? (
              <span
                className="chat-session-meta-pill chat-meta-branch"
                title={`Forked from ${selectedSession.parentSessionId}`}
              >
                Branch
              </span>
            ) : null}
            {showConversationState ? (
              <span className="chat-session-meta-pill chat-meta-count">
                {selectedMessageCount.toLocaleString()} messages
              </span>
            ) : null}
            <button
              className="chat-session-meta-pill chat-meta-workspace"
              onClick={onOpenWorkspace}
              title={workspacePath || "Open the current coding workspace"}
              type="button"
            >
              <UiIcon icon={Code2} size="xs" />
              Workspace
            </button>
            {selectedUpdatedAt ? (
              <span className="chat-session-meta-pill chat-meta-updated">
                Updated {displayTimestamp(selectedUpdatedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="chat-header-top-actions">
          {showConversationState ? (
            selectedContextPercent >= 70 ? (
              <button
                aria-label={`${selectedContextLabel} context used. Prepare context compression.`}
                className={`chat-context-compact context-${selectedContextTone}`}
                onClick={onPrepareCompression}
                title={`${selectedContextLabel} context used · Compress context`}
                type="button"
              >
                {selectedContextLabel}
              </button>
            ) : (
              <span
                className={`chat-context-compact context-${selectedContextTone}`}
                title={
                  selectedUsageError
                    ? "Context usage unavailable"
                    : `${selectedContextLabel} context used`
                }
              >
                {selectedContextLabel}
              </span>
            )
          ) : null}
          {showConversationState && selectedSession ? (
            <button
              aria-label={
                selectedSession.pinned
                  ? "Unpin conversation"
                  : "Pin conversation"
              }
              aria-pressed={selectedSession.pinned}
              className={`chat-session-meta-pill chat-meta-pin ${
                selectedSession.pinned ? "selected" : ""
              }`.trim()}
              onClick={onTogglePin}
              title={
                selectedSession.pinned
                  ? "Unpin conversation"
                  : "Pin conversation"
              }
              type="button"
            >
              <UiIcon
                className={selectedSession.pinned ? "fill-current" : ""}
                icon={Pin}
                size="xs"
              />
            </button>
          ) : null}
          <button
            aria-label={`Open route controls. Current route ${modelRouteLabel}.`}
            className="chat-model-route"
            onClick={onOpenRouteControls}
            type="button"
          >
            <strong>{modelRouteLabel}</strong>
            <UiIcon icon={ChevronDown} size="xs" />
          </button>
          {onSurfaceChange ? (
            <fieldset className="chat-surface-controls">
              <legend className="sr-only">Chat surfaces</legend>
              {(
                [
                  ["conversation", "Chat"],
                  ["history", "History"],
                  ["media", "Media"],
                ] as const
              ).map(([nextSurface, label]) => (
                <button
                  aria-controls={`chat-context-${nextSurface}`}
                  aria-pressed={surface === nextSurface}
                  className="secondary-button chat-surface-control"
                  key={nextSurface}
                  onClick={() => onSurfaceChange(nextSurface)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </fieldset>
          ) : null}
          <button
            aria-controls="mobile-conversations"
            aria-expanded={mobileConversationsOpen}
            className="chat-mobile-conversations-button secondary-button"
            onClick={onOpenMobileConversations}
            ref={mobileConversationsButtonRef}
            type="button"
          >
            <span>History</span>
            <small>{sessionsCount}</small>
          </button>
          {onSurfaceChange ? (
            <button
              aria-controls={
                surface === "media"
                  ? "chat-context-conversation"
                  : "chat-context-media"
              }
              aria-pressed={surface === "media"}
              className="chat-mobile-media-button secondary-button"
              onClick={() =>
                onSurfaceChange(surface === "media" ? "conversation" : "media")
              }
              type="button"
            >
              {surface === "media" ? "Chat" : "Media"}
            </button>
          ) : null}
          {activeRequest ? (
            <button
              className="secondary-button chat-stop-response"
              onClick={() => onCancelRequest(activeRequest)}
              type="button"
            >
              Stop response
            </button>
          ) : null}
          <button
            aria-controls="thread-workbench"
            aria-expanded={inspectorVisible}
            className={`secondary-button chat-workbench-toggle ${
              inspectorVisible ? "selected" : ""
            }`}
            onClick={onToggleInspector}
            ref={workbenchToggleRef}
            type="button"
          >
            <UiIcon icon={PanelRight} size="xs" />
            Context
          </button>
        </div>
      </div>
    </div>
  );
}
