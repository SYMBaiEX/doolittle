import type { RefObject } from "react";
import type { ApiResource } from "../lib";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import {
  parseReviewPatchLines,
  type ReviewComment,
  type ReviewCommentAnchor,
} from "../review-comments";
import {
  REVIEW_DETAIL_TOOLBAR_CLASS,
  REVIEW_PATCH_CLASS,
  REVIEW_PATCH_GUTTER_CLASS,
  reviewPatchLineClass,
} from "./layout";
import type { PatchResponse, ReviewItem } from "./models";
import {
  ReviewCommentsPanel,
  type ReviewCommentTarget,
} from "./ReviewCommentsPanel";

export interface ReviewChangesPanelProps {
  selected: ReviewItem;
  patch: ApiResource<PatchResponse>;
  selectedPathComments: ReviewComment[];
  activeCommentTarget: ReviewCommentTarget | null;
  commentDraft: string;
  editingCommentId: string;
  commentEditorRef: RefObject<HTMLTextAreaElement | null>;
  openCommentCount: number;
  platform: string;
  onOpenWorkspace: () => void;
  onAskDoolittle: () => void;
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

export function ReviewChangesPanel({
  selected,
  patch,
  selectedPathComments,
  activeCommentTarget,
  commentDraft,
  editingCommentId,
  commentEditorRef,
  openCommentCount,
  platform,
  onOpenWorkspace,
  onAskDoolittle,
  onStartComment,
  onToggleResolved,
  onDelete,
  onDraftChange,
  onCancel,
  onSave,
  onSendFeedback,
}: ReviewChangesPanelProps) {
  const path = selected.path ?? "changed file";
  return (
    <div className={REVIEW_PATCH_CLASS}>
      <div className={REVIEW_DETAIL_TOOLBAR_CLASS}>
        <span>{selected.path}</span>
        <div>
          <button
            className="text-button"
            onClick={onOpenWorkspace}
            type="button"
          >
            Open workspace
          </button>
          <button
            className="primary-button"
            disabled={!patch.data?.patch?.patch}
            onClick={onAskDoolittle}
            type="button"
          >
            Ask Doolittle
          </button>
        </div>
      </div>
      <ReviewCommentsPanel
        activeCommentTarget={activeCommentTarget}
        commentDraft={commentDraft}
        commentEditorRef={commentEditorRef}
        comments={selectedPathComments}
        editingCommentId={editingCommentId}
        onCancel={onCancel}
        onDelete={onDelete}
        onDraftChange={onDraftChange}
        onSave={onSave}
        onSendFeedback={onSendFeedback}
        onStartComment={onStartComment}
        onToggleResolved={onToggleResolved}
        openCommentCount={openCommentCount}
        path={path}
        platform={platform}
      />
      {patch.loading ? (
        <LoadingBlock label="Preparing patch…" />
      ) : patch.error ? (
        <ErrorBlock error={patch.error} retry={patch.reload} />
      ) : patch.data?.patch?.patch ? (
        <pre>
          <code>
            {parseReviewPatchLines(patch.data.patch.patch).map((line) => (
              <span className={reviewPatchLineClass(line.kind)} key={line.key}>
                {line.anchor ? (
                  <button
                    aria-label={`Add review note on ${line.anchor.side === "new" ? "new" : "old"} line ${line.anchor.line}`}
                    className={
                      selectedPathComments.some(
                        (comment) =>
                          comment.anchor?.side === line.anchor?.side &&
                          comment.anchor?.line === line.anchor?.line,
                      )
                        ? "has-comment"
                        : ""
                    }
                    onClick={() => onStartComment(path, line.anchor)}
                    title={`Comment on ${line.anchor.side === "new" ? "+" : "−"} line ${line.anchor.line}`}
                    type="button"
                  >
                    +
                  </button>
                ) : (
                  <i aria-hidden="true" className={REVIEW_PATCH_GUTTER_CLASS} />
                )}
                {line.line || " "}
              </span>
            ))}
          </code>
        </pre>
      ) : (
        <EmptyBlock title="No textual patch">
          This may be a new, binary, or metadata-only file.
        </EmptyBlock>
      )}
    </div>
  );
}
