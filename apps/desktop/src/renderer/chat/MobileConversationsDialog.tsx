import { Plus, X } from "lucide-react";
import { type RefObject, useLayoutEffect } from "react";
import type { SessionSummary } from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import { displayTimestamp } from "../lib";
import { compactSessionPreview } from "../session-preview";
import {
  MOBILE_CONVERSATIONS_BACKDROP_CLASS,
  MOBILE_CONVERSATIONS_DIALOG_CLASS,
  MOBILE_CONVERSATIONS_DISMISS_CLASS,
  MOBILE_CONVERSATIONS_LIST_CLASS,
  MOBILE_CONVERSATIONS_NEW_CLASS,
} from "./layout";

export interface MobileConversationsDialogProps {
  activeProjectName?: string;
  backdropRef: RefObject<HTMLDivElement | null>;
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
  backdropRef,
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
      dialog.querySelector<HTMLElement>("[data-mobile-conversations-search]") ??
      dialog
    ).focus();
  }, [dialogRef]);

  return (
    <div className={MOBILE_CONVERSATIONS_BACKDROP_CLASS} ref={backdropRef}>
      <button
        aria-label="Close conversations"
        className={MOBILE_CONVERSATIONS_DISMISS_CLASS}
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="mobile-conversations-title"
        aria-modal="true"
        className={MOBILE_CONVERSATIONS_DIALOG_CLASS}
        id="mobile-conversations"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow">{activeProjectName ?? "Workspace"}</span>
            <h2 id="mobile-conversations-title">Conversations</h2>
          </div>
          <button
            aria-label="Close conversations"
            className="grid size-7.5 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
            onClick={onClose}
            type="button"
          >
            <UiIcon icon={X} size="sm" />
          </button>
        </header>
        <input
          aria-label="Search conversations"
          data-mobile-conversations-search
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search conversations"
          type="search"
          value={search}
        />
        <div className={MOBILE_CONVERSATIONS_LIST_CLASS}>
          {sessions.length === 0 ? (
            <p
              aria-live="polite"
              className="px-2.5 py-3 text-[var(--muted)]"
              role="status"
            >
              No conversations match your search.
            </p>
          ) : (
            sessions.map((session) => {
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
            })
          )}
        </div>
        <button
          className={MOBILE_CONVERSATIONS_NEW_CLASS}
          onClick={onNewConversation}
          type="button"
        >
          <UiIcon icon={Plus} size="sm" /> New conversation
        </button>
      </div>
    </div>
  );
}
