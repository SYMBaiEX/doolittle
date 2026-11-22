import { Check, CircleDashed, Clock3, TriangleAlert } from "lucide-react";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import { Badge, displayTimestamp } from "../lib";
import type {
  ReviewRecordEvent,
  ReviewRecordSnapshot,
} from "../review-comments";
import type { ReviewWorkState } from "../review-work-state";
import {
  REVIEW_BRANCH_EVENTS_CLASS,
  REVIEW_BRANCH_EVIDENCE_CLASS,
  REVIEW_BRANCH_HEADING_CLASS,
  REVIEW_BRANCH_RECORD_CLASS,
  reviewOverviewClass,
} from "./layout";
import { recordEventLabel } from "./models";
import "../orchestration/work-surfaces.css";

const workStateIcons = {
  attention: TriangleAlert,
  waiting: Clock3,
  ready: Check,
  empty: CircleDashed,
} as const;

export interface ReviewOverviewProps {
  workState: ReviewWorkState;
  empty?: boolean;
  agentRunCount: number;
  changedFileCount: number;
  checksPassing: number;
  openCommentCount: number;
  branchScope?: ReviewRecordSnapshot["scope"];
  reviewBranch?: string;
  reviewHead?: string;
}

export function ReviewOverview({
  workState,
  empty = false,
  agentRunCount,
  changedFileCount,
  checksPassing,
  openCommentCount,
  branchScope,
  reviewBranch,
  reviewHead,
}: ReviewOverviewProps) {
  return (
    <section
      aria-label="Current agent work outcome"
      className={reviewOverviewClass(workState.tone, empty)}
      data-review-empty={empty || undefined}
      data-review-tone={workState.tone}
    >
      {empty ? (
        <WorkbenchEmpty title={workState.title} icon={workStateIcons.empty}>
          {workState.detail}
        </WorkbenchEmpty>
      ) : (
        <WorkbenchSection
          className="review-outcome-heading"
          title={workState.title}
          description={workState.detail}
          icon={workStateIcons[workState.icon]}
          actions={
            <span className="review-outcome-revision">
              <strong>
                {branchScope?.branch ?? reviewBranch ?? "workspace"}
              </strong>
              <code>
                {(branchScope?.head ?? reviewHead ?? "working-tree").slice(
                  0,
                  12,
                )}
              </code>
            </span>
          }
        >
          <CompactStatStrip
            label="Review summary"
            stats={[
              { label: "Agent runs", value: agentRunCount },
              { label: "Files changed", value: changedFileCount },
              { label: "Checks passed", value: checksPassing },
              {
                label: "Open notes",
                value: openCommentCount,
                tone: openCommentCount ? "warn" : "neutral",
              },
            ]}
          />
        </WorkbenchSection>
      )}
    </section>
  );
}

export interface ReviewBranchRecordProps {
  branchScope?: ReviewRecordSnapshot["scope"];
  reviewBranch?: string;
  reviewHead?: string;
  branchRecordError: string;
  checkSummary: { passing: number; failing: number };
  pendingCount: number;
  agentRunCount: number;
  openCommentCount: number;
  events: ReviewRecordEvent[];
}

export function ReviewBranchRecord({
  branchScope,
  reviewBranch,
  reviewHead,
  branchRecordError,
  checkSummary,
  pendingCount,
  agentRunCount,
  openCommentCount,
  events,
}: ReviewBranchRecordProps) {
  return (
    <section aria-label="Branch record" className={REVIEW_BRANCH_RECORD_CLASS}>
      <div className={REVIEW_BRANCH_HEADING_CLASS}>
        <span className="eyebrow">Branch record</span>
        <strong>{branchScope?.branch ?? reviewBranch ?? "detached"}</strong>
        <code>
          {(branchScope?.head ?? reviewHead ?? "working-tree").slice(0, 12)}
        </code>
        <Badge tone={branchRecordError ? "warn" : "good"}>
          {branchRecordError ? "local-only fallback" : "durable local"}
        </Badge>
      </div>
      <div className={REVIEW_BRANCH_EVIDENCE_CLASS}>
        <span>
          <strong>{checkSummary.passing}</strong> checks passing
        </span>
        <span className={checkSummary.failing ? "bad" : ""}>
          <strong>{checkSummary.failing}</strong> failing
        </span>
        <span className={pendingCount ? "warn" : ""}>
          <strong>{pendingCount}</strong> approvals
        </span>
        <span>
          <strong>{agentRunCount}</strong> agent runs
        </span>
        <span>
          <strong>{openCommentCount}</strong> open notes
        </span>
      </div>
      <ol className={REVIEW_BRANCH_EVENTS_CLASS}>
        {events.length > 0 ? (
          events.map((event) => (
            <li key={event.id}>
              <span>{recordEventLabel(event.type)}</span>
              <p>{event.detail}</p>
              <time>{displayTimestamp(event.createdAt)}</time>
            </li>
          ))
        ) : (
          <li className="empty">
            <span>No review events yet</span>
            <p>Decisions and feedback will be retained here.</p>
          </li>
        )}
      </ol>
    </section>
  );
}
