import type { RefObject } from "react";
import type { RepositoryReview } from "../../shared/contracts";
import type { ApiResource } from "../lib";
import { Badge, EmptyBlock } from "../lib";
import type { ReviewComment, ReviewCommentAnchor } from "../review-comments";
import { REVIEW_DETAIL_CLASS, REVIEW_DETAIL_HEADER_CLASS } from "./layout";
import { type PatchResponse, type ReviewItem, statusTone } from "./models";
import { ReviewApprovalPanel } from "./ReviewApprovalPanel";
import { ReviewChangesPanel } from "./ReviewChangesPanel";
import { ReviewCiPanel } from "./ReviewCiPanel";
import type { ReviewCommentTarget } from "./ReviewCommentsPanel";

export interface ReviewDetailProps {
  selected?: ReviewItem;
  review?: RepositoryReview;
  patch: ApiResource<PatchResponse>;
  selectedPathComments: ReviewComment[];
  activeCommentTarget: ReviewCommentTarget | null;
  commentDraft: string;
  editingCommentId: string;
  commentEditorRef: RefObject<HTMLTextAreaElement | null>;
  openCommentCount: number;
  busy: string;
  platform: string;
  onDecision: (decision: "approve" | "deny") => void;
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
  onCancelComment: () => void;
  onSaveComment: () => void;
  onSendFeedback: () => void;
}

export function ReviewDetail({
  selected,
  review,
  patch,
  selectedPathComments,
  activeCommentTarget,
  commentDraft,
  editingCommentId,
  commentEditorRef,
  openCommentCount,
  busy,
  platform,
  onDecision,
  onOpenWorkspace,
  onAskDoolittle,
  onStartComment,
  onToggleResolved,
  onDelete,
  onDraftChange,
  onCancelComment,
  onSaveComment,
  onSendFeedback,
}: ReviewDetailProps) {
  return (
    <section className={REVIEW_DETAIL_CLASS} data-review="detail">
      {!selected ? (
        <EmptyBlock title="No review items yet">
          Decisions, changed files, and verification results appear here.
          Completed run history stays in the Runs tab.
        </EmptyBlock>
      ) : (
        <>
          <header className={REVIEW_DETAIL_HEADER_CLASS}>
            <div>
              <span>
                {selected.kind === "approvals"
                  ? "decision required"
                  : selected.kind === "ci"
                    ? "verification"
                    : selected.kind === "changes"
                      ? "file changed"
                      : "agent work event"}
              </span>
              <h2>{selected.title}</h2>
              <p>{selected.description}</p>
            </div>
            <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
          </header>

          {selected.kind === "approvals" ? (
            <ReviewApprovalPanel
              busy={busy}
              onDecision={onDecision}
              selected={selected}
            />
          ) : null}
          {selected.kind === "changes" ? (
            <ReviewChangesPanel
              activeCommentTarget={activeCommentTarget}
              commentDraft={commentDraft}
              commentEditorRef={commentEditorRef}
              editingCommentId={editingCommentId}
              onAskDoolittle={onAskDoolittle}
              onCancel={onCancelComment}
              onDelete={onDelete}
              onDraftChange={onDraftChange}
              onOpenWorkspace={onOpenWorkspace}
              onSave={onSaveComment}
              onSendFeedback={onSendFeedback}
              onStartComment={onStartComment}
              onToggleResolved={onToggleResolved}
              openCommentCount={openCommentCount}
              patch={patch}
              platform={platform}
              selected={selected}
              selectedPathComments={selectedPathComments}
            />
          ) : null}
          {selected.kind === "ci" ? (
            <ReviewCiPanel review={review} selected={selected} />
          ) : null}
        </>
      )}
    </section>
  );
}
