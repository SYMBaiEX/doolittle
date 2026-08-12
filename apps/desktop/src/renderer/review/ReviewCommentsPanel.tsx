import { type RefObject, useEffect, useState } from "react";
import { Badge } from "../lib";
import type { ReviewComment, ReviewCommentAnchor } from "../review-comments";

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

  useEffect(() => {
    if (comments.length > 0 || activeCommentTarget) {
      setNotesOpen(true);
    }
  }, [activeCommentTarget, comments.length]);

  return (
    <details
      aria-label={`Review comments for ${path}`}
      className="review-feedback"
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
        <i aria-hidden="true">⌄</i>
      </summary>

      {notesOpen ? (
        <div className="review-feedback__body">
          <div className="review-feedback__actions">
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
            <ol className="review-comment-list">
              {comments.map((comment) => (
                <li
                  className={comment.status === "resolved" ? "resolved" : ""}
                  key={comment.id}
                >
                  <div className="review-comment-location">
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
                  <div className="review-comment-actions">
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
                      onClick={() => onDelete(comment.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="review-feedback-empty">
              Add a file note or use <strong>+</strong> beside a diff line.
              Drafts stay with this workspace revision.
            </p>
          )}

          {activeCommentTarget ? (
            <div className="review-comment-editor">
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
    </details>
  );
}
