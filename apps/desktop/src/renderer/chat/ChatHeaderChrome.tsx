import type { RefObject } from "react";
import type { ContextPressureTone } from "../context-pressure";
import { displayTimestamp } from "../lib";
import { compactSessionPreview } from "../session-preview";
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
  onOpenRouteControls: () => void;
  onOpenWorkspace: () => void;
  onPrepareCompression: () => void;
  onToggleInspector: () => void;
  onTogglePin: () => void;
  selectedContextLabel: string;
  selectedContextPercent: number;
  selectedContextTone: ContextPressureTone;
  selectedMessageCount: number;
  selectedSession?: ChatSessionForRender;
  selectedUpdatedAt?: string;
  selectedUsageError?: string;
  sessionsCount: number;
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
  onOpenRouteControls,
  onOpenWorkspace,
  onPrepareCompression,
  onToggleInspector,
  onTogglePin,
  selectedContextLabel,
  selectedContextPercent,
  selectedContextTone,
  selectedMessageCount,
  selectedSession,
  selectedUpdatedAt,
  selectedUsageError,
  sessionsCount,
  workbenchToggleRef,
  workspacePath,
}: ChatHeaderChromeProps) {
  const showConversationState = !isNewConversation;
  const conversationTitle = selectedSession
    ? compactSessionPreview(selectedSession.title ?? "") ||
      "Untitled conversation"
    : "New conversation";

  return (
    <div className="chat-header-content">
      <div className="chat-header-mainline">
        <div className="chat-header-title-wrap">
          <h2 title={selectedSession ? conversationTitle : undefined}>
            {conversationTitle}
          </h2>
        </div>
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
              Code
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
              <span aria-hidden="true">
                {selectedSession.pinned ? "◆" : "◇"}
              </span>
            </button>
          ) : null}
          <button
            aria-label={`Open route controls. Current route ${modelRouteLabel}.`}
            className="chat-model-route"
            onClick={onOpenRouteControls}
            type="button"
          >
            <strong>{modelRouteLabel}</strong>
          </button>
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
          {activeRequest ? (
            <button
              className="secondary-button"
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
            <span aria-hidden="true">◧</span>
            Workbench
          </button>
        </div>
      </div>
    </div>
  );
}
