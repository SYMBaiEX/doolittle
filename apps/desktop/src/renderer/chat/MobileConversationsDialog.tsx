import { type RefObject, useLayoutEffect } from "react";
import type { SessionSummary } from "../../shared/contracts";
import { displayTimestamp } from "../lib";
import { compactSessionPreview } from "../session-preview";

export interface MobileConversationsDialogProps {
  activeProjectName?: string;
  dialogRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNewConversation: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (sessionId: string) => void;
  projectLabels?: Readonly<Record<string, string>>;
  search: string;
  selectedId: string;
  sessions: readonly SessionSummary[];
}

export function MobileConversationsDialog({
  activeProjectName,
  dialogRef,
  onClose,
  onNewConversation,
  onSearchChange,
  onSelect,
  projectLabels,
  search,
  selectedId,
  sessions,
}: MobileConversationsDialogProps) {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.contains(document.activeElement)) return;
    (
      dialog.querySelector<HTMLElement>("[data-mobile-conversation]") ?? dialog
    ).focus();
  }, [dialogRef]);

  return (
    <div className="chat-mobile-conversations-backdrop">
      <button
        aria-label="Close conversations"
        className="chat-mobile-conversations-dismiss"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Conversations"
        aria-modal="true"
        className="chat-mobile-conversations-dialog"
        id="mobile-conversations"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow">{activeProjectName ?? "Workspace"}</span>
            <h2>Conversations</h2>
          </div>
          <button
            aria-label="Close conversations"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <input
          aria-label="Search conversations"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search conversations"
          type="search"
          value={search}
        />
        <div className="chat-mobile-conversations-list">
          {sessions.map((session) => {
            const conversationTitle =
              compactSessionPreview(session.title ?? "") ||
              "Untitled conversation";
            return (
              <button
                aria-current={
                  session.sessionId === selectedId ? "page" : undefined
                }
                data-mobile-conversation
                key={session.sessionId}
                onClick={() => {
                  onSelect(session.sessionId);
                  onClose();
                }}
                type="button"
              >
                <strong title={conversationTitle}>{conversationTitle}</strong>
                <span>
                  {session.messageCount} messages ·{" "}
                  {displayTimestamp(session.endedAt)}
                  {projectLabels
                    ? ` · ${session.projectId ? (projectLabels[session.projectId] ?? "Project") : "Unscoped"}`
                    : ""}
                </span>
              </button>
            );
          })}
        </div>
        <button
          className="new-chat-button"
          onClick={onNewConversation}
          type="button"
        >
          <span>＋</span> New conversation
        </button>
      </div>
    </div>
  );
}
