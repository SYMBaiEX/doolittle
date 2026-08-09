import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import type { RepositoryReview } from "../../shared/contracts";
import { GitControlPanel } from "../components/GitControlPanel";
import { GitHubPullRequestPanel } from "../components/GitHubPullRequestPanel";
import { Notice } from "../lib";
import type { RepositoryControlChange } from "../repository-control";
import type {
  ReviewRecordEvent,
  ReviewRecordSnapshot,
} from "../review-comments";
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
}: ReviewEvidenceProps) {
  return (
    <details className="review-evidence-drawer">
      <summary>
        <span>
          <strong>Repository evidence</strong>
          <small>
            {changedFileCount} changed · {checkSummary.passing} passed ·{" "}
            {checkSummary.failing} failed
            {review?.pullRequest ? ` · PR #${review.pullRequest.number}` : ""}
          </small>
        </span>
        <i aria-hidden="true">›</i>
      </summary>
      <div className="review-evidence-body">
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
        <details className="review-git-controls">
          <summary>
            Source control · {changedFileCount} changes
            {conflicts.length ? ` · ${conflicts.length} conflicts` : ""}
          </summary>
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
        </details>
      </div>
    </details>
  );
}
