import { PanelTop, Send } from "lucide-react";
import type { RefObject } from "react";
import { WorkbenchAction } from "../components/workbench/Workbench";
import type { ApiResource } from "../lib";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import type { RepositoryPatchResponse } from "../repository-resource-models";
import type { ReviewComment, ReviewCommentAnchor } from "../review-comments";
import { REVIEW_DETAIL_TOOLBAR_CLASS, REVIEW_PATCH_CLASS } from "./layout";
import type { ReviewItem } from "./models";
import {
  ReviewCommentsPanel,
  type ReviewCommentTarget,
} from "./ReviewCommentsPanel";
import { ReviewPatch, type ReviewPatchMutation } from "./ReviewPatch";

export interface ReviewChangesPanelProps {
  contextScope?: string;
  selected: ReviewItem;
  patch: ApiResource<RepositoryPatchResponse>;
  selectedPathComments: ReviewComment[];
  activeCommentTarget: ReviewCommentTarget | null;
  commentDraft: string;
  commentSaveInFlight: boolean;
  editingCommentId: string;
  commentEditorRef: RefObject<HTMLTextAreaElement | null>;
  openCommentCount: number;
  platform: string;
  patchMutationBusy?: boolean;
  patchMutationError?: string;
  onPatchMutation?: (mutation: ReviewPatchMutation) => void;
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
  contextScope,
  selected,
  patch,
  selectedPathComments,
  activeCommentTarget,
  commentDraft,
  commentSaveInFlight,
  editingCommentId,
  commentEditorRef,
  openCommentCount,
  platform,
  patchMutationBusy = false,
  patchMutationError = "",
  onPatchMutation,
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
          <WorkbenchAction
            emphasis="quiet"
            icon={PanelTop}
            onClick={onOpenWorkspace}
          >
            Open workspace
          </WorkbenchAction>
          <WorkbenchAction
            emphasis="primary"
            icon={Send}
            disabled={!patch.data?.patch?.patch}
            onClick={onAskDoolittle}
          >
            Ask Doolittle
          </WorkbenchAction>
        </div>
      </div>
      <ReviewCommentsPanel
        contextScope={contextScope}
        activeCommentTarget={activeCommentTarget}
        commentDraft={commentDraft}
        commentEditorRef={commentEditorRef}
        commentSaveInFlight={commentSaveInFlight}
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
        <ReviewPatch
          mutationBusy={patchMutationBusy}
          mutationError={patchMutationError}
          onPatchMutation={onPatchMutation}
          onStartComment={onStartComment}
          patch={patch.data.patch.patch}
          path={path}
          selectedPathComments={selectedPathComments}
          staged={patch.data.patch.staged}
          truncated={patch.data.patch.truncated}
        />
      ) : (
        <EmptyBlock title="No textual patch">
          This may be a new, binary, or metadata-only file.
        </EmptyBlock>
      )}
    </div>
  );
}
