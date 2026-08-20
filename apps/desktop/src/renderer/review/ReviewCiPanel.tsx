import { ExternalLink } from "lucide-react";
import type { RepositoryReview } from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import {
  asNumber,
  asString,
  Badge,
  displayTimestamp,
  EmptyBlock,
} from "../lib";
import {
  REVIEW_ADDITIONS_CLASS,
  REVIEW_CI_CHECKS_CLASS,
  REVIEW_CI_HERO_CLASS,
  REVIEW_DELETIONS_CLASS,
  REVIEW_DETAIL_BODY_CLASS,
  REVIEW_FACTS_CLASS,
} from "./layout";
import { checkDisplayStatus, type ReviewItem, statusTone } from "./models";

export interface ReviewCiPanelProps {
  selected: ReviewItem;
  review?: RepositoryReview;
}

export function ReviewCiPanel({ selected, review }: ReviewCiPanelProps) {
  return (
    <div className={`${REVIEW_DETAIL_BODY_CLASS} review-ci-detail`}>
      {asString(selected.raw.category) === "pull-request" ? (
        <PullRequestReview selected={selected} review={review} />
      ) : (
        <CheckOrWorkflowReview selected={selected} review={review} />
      )}
    </div>
  );
}

function PullRequestReview({ selected, review }: ReviewCiPanelProps) {
  const pullRequestUrl = asString(selected.raw.url);
  return (
    <>
      <div className={REVIEW_CI_HERO_CLASS}>
        <div>
          <span>Pull request</span>
          <strong>
            {asString(selected.raw.headRefName, "branch")} →{" "}
            {asString(selected.raw.baseRefName, "base")}
          </strong>
        </div>
        {pullRequestUrl ? (
          <a href={pullRequestUrl} rel="noreferrer" target="_blank">
            Open on GitHub
            <UiIcon icon={ExternalLink} size="xs" />
          </a>
        ) : null}
      </div>
      <dl className={REVIEW_FACTS_CLASS}>
        <div>
          <dt>Review</dt>
          <dd>
            {asString(selected.raw.reviewDecision, "No decision")
              .toLowerCase()
              .replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt>Merge state</dt>
          <dd>
            {asString(selected.raw.mergeStateStatus, "unknown").toLowerCase()}
          </dd>
        </div>
        <div>
          <dt>Changes</dt>
          <dd>
            <span className={REVIEW_ADDITIONS_CLASS}>
              +{asNumber(selected.raw.additions)}
            </span>{" "}
            <span className={REVIEW_DELETIONS_CLASS}>
              −{asNumber(selected.raw.deletions)}
            </span>{" "}
            across {asNumber(selected.raw.changedFiles)} files
          </dd>
        </div>
        <div>
          <dt>Conversation</dt>
          <dd>
            {asNumber(selected.raw.comments)} comments ·{" "}
            {asNumber(selected.raw.reviews)} reviews
          </dd>
        </div>
      </dl>
      <div className={REVIEW_CI_CHECKS_CLASS}>
        <div>
          <span>Checks</span>
          <small>{review?.checks.length ?? 0}</small>
        </div>
        {(review?.checks ?? []).length > 0 ? (
          <ul>
            {(review?.checks ?? []).map((check) => {
              const checkStatus = checkDisplayStatus(check);
              return (
                <li
                  key={[
                    check.name,
                    check.workflow,
                    check.url,
                    check.startedAt,
                    check.completedAt,
                  ].join(":")}
                >
                  <i className={statusTone(checkStatus)} aria-hidden="true" />
                  <span>
                    <strong>{check.name}</strong>
                    <small>{check.workflow ?? "Pull request check"}</small>
                  </span>
                  <Badge tone={statusTone(checkStatus)}>{checkStatus}</Badge>
                  {check.url ? (
                    <a
                      aria-label={`Open ${check.name} on GitHub`}
                      href={check.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <UiIcon icon={ExternalLink} size="xs" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyBlock density="compact" title="No checks reported">
            GitHub has not reported checks for this pull request.
          </EmptyBlock>
        )}
      </div>
    </>
  );
}

function CheckOrWorkflowReview({ selected, review }: ReviewCiPanelProps) {
  return (
    <>
      <div className={REVIEW_CI_HERO_CLASS}>
        <div>
          <span>
            {asString(selected.raw.category) === "check"
              ? "Check"
              : "Workflow run"}
          </span>
          <strong>{selected.title}</strong>
        </div>
        {asString(selected.raw.url) ? (
          <a href={asString(selected.raw.url)} rel="noreferrer" target="_blank">
            Open on GitHub
            <UiIcon icon={ExternalLink} size="xs" />
          </a>
        ) : null}
      </div>
      <dl className={REVIEW_FACTS_CLASS}>
        <div>
          <dt>Status</dt>
          <dd>{selected.status}</dd>
        </div>
        <div>
          <dt>Workflow</dt>
          <dd>
            {asString(
              selected.raw.workflow,
              asString(selected.raw.event, "GitHub Actions"),
            )}
          </dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>
            {asString(
              selected.raw.headBranch,
              review?.branch ?? "current branch",
            )}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            {displayTimestamp(
              asString(
                selected.raw.completedAt,
                asString(
                  selected.raw.updatedAt,
                  asString(selected.raw.startedAt),
                ),
              ),
            )}
          </dd>
        </div>
      </dl>
    </>
  );
}
