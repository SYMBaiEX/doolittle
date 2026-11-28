import { type ContextAction, ContextActionMenu } from "@doolittle/ui";
import {
  CircleCheck,
  GitCompareArrows,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import type { RefObject } from "react";
import type { RepositoryReview } from "../../shared/contracts";
import {
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import { copyContextText } from "../context-menu-clipboard";
import type { ApiResource } from "../lib";
import { Badge } from "../lib";
import type { RepositoryPatchResponse } from "../repository-resource-models";
import type { ReviewComment, ReviewCommentAnchor } from "../review-comments";
import {
  REVIEW_DETAIL_CLASS,
  REVIEW_DETAIL_DOCK_CLASS,
  REVIEW_DETAIL_SCROLL_CLASS,
} from "./layout";
import { type ReviewItem, statusTone } from "./models";
import {
  ReviewApprovalActions,
  ReviewApprovalPanel,
} from "./ReviewApprovalPanel";
import { ReviewChangesPanel } from "./ReviewChangesPanel";
import { ReviewCiPanel } from "./ReviewCiPanel";
import type { ReviewCommentTarget } from "./ReviewCommentsPanel";
import type { ReviewPatchMutation } from "./ReviewPatch";

export interface ReviewDetailProps {
  contextScope?: string;
  selected?: ReviewItem;
  review?: RepositoryReview;
  patch: ApiResource<RepositoryPatchResponse>;
  selectedPathComments: ReviewComment[];
  activeCommentTarget: ReviewCommentTarget | null;
  commentDraft: string;
  commentSaveInFlight: boolean;
  editingCommentId: string;
  commentEditorRef: RefObject<HTMLTextAreaElement | null>;
  openCommentCount: number;
  busy: string;
  platform: string;
  patchMutationBusy?: boolean;
  patchMutationError?: string;
  onPatchMutation?: (mutation: ReviewPatchMutation) => void;
  onDecision: (decision: "approve" | "deny") => void;
  onAlwaysAllow?: () => void;
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
  contextScope,
  selected,
  review,
  patch,
  selectedPathComments,
  activeCommentTarget,
  commentDraft,
  commentSaveInFlight,
  editingCommentId,
  commentEditorRef,
  openCommentCount,
  busy,
  platform,
  patchMutationBusy = false,
  patchMutationError = "",
  onPatchMutation,
  onDecision,
  onAlwaysAllow,
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
  const actions: ContextAction[] = selected
    ? [
        {
          id: "copy-title",
          label: "Copy review title",
          onSelect: () => void copyContextText(selected.title),
        },
        {
          id: "copy-path",
          label: "Copy file path",
          disabled: !selected.path,
          onSelect: () => {
            if (selected.path) void copyContextText(selected.path);
          },
        },
        ...(selected.kind === "changes"
          ? [
              {
                id: "workspace",
                label: "Open workspace",
                disabled: !selected.path,
                onSelect: onOpenWorkspace,
              },
              {
                id: "ask",
                label: "Ask Doolittle",
                disabled: !selected.path || !patch.data?.patch?.patch,
                onSelect: onAskDoolittle,
              },
            ]
          : []),
        ...(selected.kind === "approvals" && selected.status === "pending"
          ? [
              {
                id: "approve",
                label: "Approve request",
                disabled: Boolean(busy),
                separatorBefore: true,
                onSelect: () => onDecision("approve"),
              },
              {
                id: "deny",
                label: "Deny request",
                disabled: Boolean(busy),
                destructive: true,
                onSelect: () => onDecision("deny"),
              },
            ]
          : []),
      ]
    : [];
  return (
    <ContextActionMenu
      items={actions}
      label="Review detail actions"
      scopeKey={JSON.stringify([contextScope ?? "", selected?.id ?? ""])}
    >
      <section className={REVIEW_DETAIL_CLASS} data-review="detail">
        <div className={REVIEW_DETAIL_SCROLL_CLASS}>
          {!selected ? (
            <WorkbenchEmpty title="Select an item to review" icon={Inbox}>
              Choose a decision, file, or check from the review queue.
            </WorkbenchEmpty>
          ) : (
            <WorkbenchSection
              title={selected.title}
              description={selected.description}
              icon={
                selected.kind === "approvals"
                  ? ShieldCheck
                  : selected.kind === "changes"
                    ? GitCompareArrows
                    : CircleCheck
              }
              actions={
                <Badge tone={statusTone(selected.status)}>
                  {selected.status}
                </Badge>
              }
              className="review-selection"
            >
              {selected.kind === "approvals" ? (
                <ReviewApprovalPanel
                  busy={busy}
                  onDecision={onDecision}
                  selected={selected}
                />
              ) : null}
              {selected.kind === "changes" ? (
                <ReviewChangesPanel
                  contextScope={contextScope}
                  activeCommentTarget={activeCommentTarget}
                  commentDraft={commentDraft}
                  commentEditorRef={commentEditorRef}
                  commentSaveInFlight={commentSaveInFlight}
                  editingCommentId={editingCommentId}
                  onAskDoolittle={onAskDoolittle}
                  onCancel={onCancelComment}
                  onDelete={onDelete}
                  onDraftChange={onDraftChange}
                  onOpenWorkspace={onOpenWorkspace}
                  onPatchMutation={onPatchMutation}
                  onSave={onSaveComment}
                  onSendFeedback={onSendFeedback}
                  onStartComment={onStartComment}
                  onToggleResolved={onToggleResolved}
                  openCommentCount={openCommentCount}
                  patch={patch}
                  patchMutationBusy={patchMutationBusy}
                  patchMutationError={patchMutationError}
                  platform={platform}
                  selected={selected}
                  selectedPathComments={selectedPathComments}
                />
              ) : null}
              {selected.kind === "ci" ? (
                <ReviewCiPanel review={review} selected={selected} />
              ) : null}
            </WorkbenchSection>
          )}
        </div>
        {selected?.kind === "approvals" && selected.status === "pending" ? (
          <div
            className={REVIEW_DETAIL_DOCK_CLASS}
            data-review-actions-dock="true"
          >
            <ReviewApprovalActions
              busy={busy}
              onAlwaysAllow={onAlwaysAllow}
              onDecision={onDecision}
            />
          </div>
        ) : null}
      </section>
    </ContextActionMenu>
  );
}
