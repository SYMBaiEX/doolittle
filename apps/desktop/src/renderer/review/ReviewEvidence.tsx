import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { ChevronRight } from "lucide-react";
import type { RepositoryReview } from "../../shared/contracts";
import { GitControlPanel } from "../components/GitControlPanel";
import { GitHubPullRequestPanel } from "../components/GitHubPullRequestPanel";
import { UiIcon } from "../components/UiIcon";
import { LoadingBlock, Notice } from "../lib";
import type { RepositoryControlChange } from "../repository-control";
import type {
  ReviewRecordEvent,
  ReviewRecordSnapshot,
} from "../review-comments";
import {
  REVIEW_DISCLOSURE_ICON_CLASS,
  REVIEW_EVIDENCE_BODY_CLASS,
  REVIEW_EVIDENCE_DRAWER_CLASS,
  REVIEW_GIT_CONTROLS_CLASS,
} from "./layout";
import { ReviewBranchRecord } from "./ReviewOverview";

export interface ReviewEvidenceProps {
  active: boolean;
  review?: RepositoryReview;
  repositoryReviewError: string;
  onRefresh: () => void;
  branchScope?: ReviewRecordSnapshot["scope"];
  branchEvents: ReviewRecordEvent[];
  branchRecordError: string;
  checkSummary: { passing: number; failing: number };
  pendingCount: number;
  agentRunCount: number;
  changedFileCount: number;
  openCommentCount: number;
  branches: RepositoryBranch[];
  changes: RepositoryControlChange[];
  conflicts: RepositoryConflict[];
  remotes: RepositoryRemote[];
  stashes: RepositoryStash[];
  worktrees: Array<{
    path: string;
    branch?: string;
    current?: boolean;
    prunable?: boolean;
  }>;
  evidenceOpen: boolean;
  sourceControlOpen: boolean;
  sourceControlLoading: boolean;
  sourceControlErrorCount: number;
  onEvidenceOpenChange: (open: boolean) => void;
  onSourceControlOpenChange: (open: boolean) => void;
}

export function ReviewEvidence({
  active,
  review,
  repositoryReviewError,
  onRefresh,
  branchScope,
  branchEvents,
  branchRecordError,
  checkSummary,
  pendingCount,
  agentRunCount,
  changedFileCount,
  openCommentCount,
  branches,
  changes,
  conflicts,
  remotes,
  stashes,
  worktrees,
  evidenceOpen,
  sourceControlOpen,
  sourceControlLoading,
  sourceControlErrorCount,
  onEvidenceOpenChange,
  onSourceControlOpenChange,
}: ReviewEvidenceProps) {
  return (
    <details
      className={REVIEW_EVIDENCE_DRAWER_CLASS}
      data-review="evidence"
      onToggle={(event) => onEvidenceOpenChange(event.currentTarget.open)}
    >
      <summary>
        <span>
          <strong>Repository evidence</strong>
          <small>
            {changedFileCount} changed · {checkSummary.passing} passed ·{" "}
            {checkSummary.failing} failed
            {review?.pullRequest ? ` · PR #${review.pullRequest.number}` : ""}
          </small>
        </span>
        <UiIcon
          className={REVIEW_DISCLOSURE_ICON_CLASS}
          icon={ChevronRight}
          size="xs"
        />
      </summary>
      {evidenceOpen ? (
        <div className={REVIEW_EVIDENCE_BODY_CLASS}>
          {repositoryReviewError ? (
            <Notice tone="warn">
              GitHub review is unavailable. Local evidence remains reviewable.
            </Notice>
          ) : (
            <GitHubPullRequestPanel
              active={active}
              onRefresh={onRefresh}
              review={review}
            />
          )}
          <ReviewBranchRecord
            agentRunCount={agentRunCount}
            branchRecordError={branchRecordError}
            branchScope={branchScope}
            checkSummary={checkSummary}
            events={branchEvents}
            openCommentCount={openCommentCount}
            pendingCount={pendingCount}
            reviewBranch={review?.local.branch ?? review?.branch}
            reviewHead={review?.local.head}
          />
          <details
            className={REVIEW_GIT_CONTROLS_CLASS}
            onToggle={(event) =>
              onSourceControlOpenChange(event.currentTarget.open)
            }
          >
            <summary>
              Source control · {changedFileCount} changes
              {conflicts.length ? ` · ${conflicts.length} conflicts` : ""}
            </summary>
            {sourceControlOpen ? (
              sourceControlLoading ? (
                <LoadingBlock label="Loading source-control details…" />
              ) : (
                <>
                  {sourceControlErrorCount ? (
                    <Notice tone="warn">
                      {sourceControlErrorCount} source-control{" "}
                      {sourceControlErrorCount === 1
                        ? "source is"
                        : "sources are"}{" "}
                      unavailable. Connected repository data remains usable.
                    </Notice>
                  ) : null}
                  <GitControlPanel
                    active={active && review?.local.isRepository !== false}
                    branches={branches}
                    changes={changes}
                    conflicts={conflicts}
                    onRefresh={onRefresh}
                    remotes={remotes}
                    stashes={stashes}
                    variant="full"
                    worktrees={worktrees}
                  />
                </>
              )
            ) : null}
          </details>
        </div>
      ) : null}
    </details>
  );
}
