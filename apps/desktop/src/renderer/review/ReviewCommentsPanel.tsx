import { type RefObject, useEffect, useRef, useState } from "react";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import { Badge } from "../lib";
import type { ReviewComment, ReviewCommentAnchor } from "../review-comments";
import {
  REVIEW_COMMENT_ACTIONS_CLASS,
  REVIEW_COMMENT_CLASS,
  REVIEW_COMMENT_EDITOR_CLASS,
  REVIEW_COMMENT_LIST_CLASS,
  REVIEW_COMMENT_LOCATION_CLASS,
  REVIEW_COMMENT_RESOLVED_CLASS,
  REVIEW_DELETE_BACKDROP_CLASS,
  REVIEW_DELETE_CONFIRMATION_CLASS,
  REVIEW_FEEDBACK_ACTIONS_CLASS,
  REVIEW_FEEDBACK_BODY_CLASS,
  REVIEW_FEEDBACK_CLASS,
  REVIEW_FEEDBACK_EMPTY_CLASS,
  REVIEW_FEEDBACK_ICON_CLASS,
} from "./layout";

export interface ReviewCommentTarget {
  path: string;
  anchor?: ReviewCommentAnchor;
}

export interface ReviewCommentsPanelProps {
  path: string;
  comments: ReviewComment[];
  openCommentCount: number;
  activeCommentTarget: ReviewCommentTarget | null;
  commentDraft: string;
  editingCommentId: string;
  commentEditorRef: RefObject<HTMLTextAreaElement | null>;
  platform: string;
  onStartComment: (
    path: string,
    anchor?: ReviewCommentAnchor,
    existing?: ReviewComment,
  ) => void;
  onToggleResolved: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onDraftChange: (draft: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onSendFeedback: () => void;
}

export function ReviewCommentsPanel({
  path,
  comments,
  openCommentCount,
  activeCommentTarget,
  commentDraft,
  editingCommentId,
  commentEditorRef,
  platform,
  onStartComment,
  onToggleResolved,
  onDelete,
  onDraftChange,
  onCancel,
  onSave,
  onSendFeedback,
}: ReviewCommentsPanelProps) {
  const [notesOpen, setNotesOpen] = useState(
    comments.length > 0 || Boolean(activeCommentTarget),
  );
  const [pendingDelete, setPendingDelete] = useState<ReviewComment | null>(
    null,
  );
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteBackdropRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useModalFocusBoundary({
    active: Boolean(pendingDelete),
    initialFocusSelector: "[data-review-delete-cancel]",
    isolationBoundaryRef: deleteBackdropRef,
    isolateBackground: true,
    onClose: () => setPendingDelete(null),
    restoreFocus: true,
    restoreFocusRef: deleteTriggerRef,
  });

  useEffect(() => {
    if (comments.length > 0 || activeCommentTarget) {
      setNotesOpen(true);
    }
  }, [activeCommentTarget, comments.length]);

  return (
    <details
      aria-label={`Review comments for ${path}`}
      className={REVIEW_FEEDBACK_CLASS}
      data-review="feedback"
      onToggle={(event) => setNotesOpen(event.currentTarget.open)}
      open={notesOpen}
    >
      <summary>
        <span>
          <strong>Review notes</strong>
          <small>
            {comments.filter((comment) => comment.status === "open").length}{" "}
            open on this file
          </small>
        </span>
        <i aria-hidden="true" className={REVIEW_FEEDBACK_ICON_CLASS}>
          ⌄
        </i>
      </summary>

      {notesOpen ? (
        <div className={REVIEW_FEEDBACK_BODY_CLASS}>
          <div className={REVIEW_FEEDBACK_ACTIONS_CLASS}>
            <button
              className="text-button"
              onClick={() => onStartComment(path)}
              type="button"
            >
              + File note
            </button>
            <button
              className="primary-button"
              disabled={openCommentCount === 0}
              onClick={onSendFeedback}
              type="button"
            >
              {openCommentCount > 0
                ? `Send ${openCommentCount} to chat`
                : "Send to chat"}
            </button>
          </div>

          {comments.length > 0 ? (
            <ol className={REVIEW_COMMENT_LIST_CLASS}>
              {comments.map((comment) => (
                <li
                  className={`${REVIEW_COMMENT_CLASS} ${
                    comment.status === "resolved"
                      ? REVIEW_COMMENT_RESOLVED_CLASS
                      : ""
                  }`}
                  key={comment.id}
                >
                  <div className={REVIEW_COMMENT_LOCATION_CLASS}>
                    <span>
                      {comment.anchor
                        ? `${comment.anchor.side === "new" ? "+" : "−"} line ${comment.anchor.line}`
                        : "Whole file"}
                    </span>
                    <Badge
                      tone={comment.status === "open" ? "warn" : "neutral"}
                    >
                      {comment.status}
                    </Badge>
                  </div>
                  {comment.anchor?.preview ? (
                    <code>{comment.anchor.preview}</code>
                  ) : null}
                  <p>{comment.body}</p>
                  <div className={REVIEW_COMMENT_ACTIONS_CLASS}>
                    <button
                      onClick={() => onToggleResolved(comment.id)}
                      type="button"
                    >
                      {comment.status === "open" ? "Resolve" : "Reopen"}
                    </button>
                    <button
                      onClick={() =>
                        onStartComment(comment.path, comment.anchor, comment)
                      }
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      aria-label={`Delete review note for ${comment.path}`}
                      className="danger"
                      onClick={(event) => {
                        deleteTriggerRef.current = event.currentTarget;
                        setPendingDelete(comment);
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={REVIEW_FEEDBACK_EMPTY_CLASS}>
              Add a file note or use <strong>+</strong> beside a diff line.
              Drafts stay with this workspace revision.
            </p>
          )}

          {activeCommentTarget ? (
            <div className={REVIEW_COMMENT_EDITOR_CLASS}>
              <label htmlFor="review-comment-draft">
                {editingCommentId
                  ? "Edit review note"
                  : activeCommentTarget.anchor
                    ? `Comment on ${activeCommentTarget.anchor.side === "new" ? "+" : "−"} line ${activeCommentTarget.anchor.line}`
                    : "Comment on this file"}
              </label>
              {activeCommentTarget.anchor?.preview ? (
                <code>{activeCommentTarget.anchor.preview}</code>
              ) : null}
              <textarea
                id="review-comment-draft"
                maxLength={2_000}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    onSave();
                  } else if (event.key === "Escape") {
                    onCancel();
                  }
                }}
                placeholder="Describe the change you want the agent to make…"
                ref={commentEditorRef}
                rows={3}
                value={commentDraft}
              />
              <div>
                <small>
                  {commentDraft.length.toLocaleString()} / 2,000 ·{" "}
                  {platform === "darwin" ? "⌘ Enter" : "Ctrl Enter"} to save
                </small>
                <button
                  className="text-button"
                  onClick={onCancel}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={!commentDraft.trim()}
                  onClick={onSave}
                  type="button"
                >
                  {editingCommentId ? "Save changes" : "Save note"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {pendingDelete ? (
        <div
          className={REVIEW_DELETE_BACKDROP_CLASS}
          ref={deleteBackdropRef}
          role="presentation"
        >
          <div
            aria-labelledby="review-delete-title"
            aria-describedby="review-delete-description"
            aria-modal="true"
            className={REVIEW_DELETE_CONFIRMATION_CLASS}
            ref={deleteDialogRef}
            role="alertdialog"
            tabIndex={-1}
          >
            <h3 id="review-delete-title">Delete review note?</h3>
            <p id="review-delete-description">
              This will remove the note for {pendingDelete.path}
              {pendingDelete.anchor
                ? ` on the ${pendingDelete.anchor.side === "new" ? "+" : "−"} line ${pendingDelete.anchor.line}`
                : ""}
              . “{pendingDelete.body}” This cannot be undone.
            </p>
            <div>
              <button
                data-review-delete-cancel
                onClick={() => setPendingDelete(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger"
                onClick={() => {
                  onDelete(pendingDelete.id);
                  setPendingDelete(null);
                }}
                type="button"
              >
                Delete note
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </details>
  );
}
