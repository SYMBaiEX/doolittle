import { Badge, displayTimestamp } from "../lib";
import type {
  ReviewRecordEvent,
  ReviewRecordSnapshot,
} from "../review-comments";
import type { ReviewWorkState } from "../review-work-state";
import { recordEventLabel } from "./models";

export interface ReviewHeaderProps {
  active: boolean;
  embedded: boolean;
  pendingCount: number;
  itemCount: number;
  onRefresh: () => void;
}

export function ReviewHeader({
  active,
  embedded,
  pendingCount,
  itemCount,
  onRefresh,
}: ReviewHeaderProps) {
  if (embedded) return null;
  return (
    <header className="review-header">
      <div>
        <span className="eyebrow">Agent work</span>
        <h1>Review what Doolittle did</h1>
        <p>
          Inspect the outcome, changed files, verification, and decisions from
          completed work without reconstructing the agent’s entire chat.
        </p>
      </div>
      <div className="review-header-status">
        <span>
          <strong>{pendingCount}</strong> needs you
        </span>
        <span>
          <strong>{itemCount}</strong> work events
        </span>
        <button
          className="secondary-button"
          disabled={!active}
          onClick={onRefresh}
          type="button"
        >
          Refresh
        </button>
      </div>
    </header>
  );
}

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
      className={`review-work-overview ${workState.tone}${empty ? " is-empty" : ""}`}
    >
      <div className="review-work-outcome">
        <i aria-hidden="true">{workState.icon}</i>
        <span>
          <small>Current workset</small>
          <strong>{workState.title}</strong>
          <p>{workState.detail}</p>
        </span>
      </div>
      {!empty ? (
        <>
          <dl className="review-work-metrics">
            <div>
              <dt>Agent runs</dt>
              <dd>{agentRunCount}</dd>
            </div>
            <div>
              <dt>Files changed</dt>
              <dd>{changedFileCount}</dd>
            </div>
            <div>
              <dt>Checks passed</dt>
              <dd>{checksPassing}</dd>
            </div>
            <div className={openCommentCount ? "warn" : ""}>
              <dt>Open notes</dt>
              <dd>{openCommentCount}</dd>
            </div>
          </dl>
          <div className="review-work-revision">
            <small>Revision</small>
            <strong>
              {branchScope?.branch ?? reviewBranch ?? "workspace"}
            </strong>
            <code>
              {(branchScope?.head ?? reviewHead ?? "working-tree").slice(0, 12)}
            </code>
          </div>
        </>
      ) : null}
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
    <section aria-label="Branch record" className="review-branch-record">
      <div className="review-branch-record-heading">
        <span className="eyebrow">Branch record</span>
        <strong>{branchScope?.branch ?? reviewBranch ?? "detached"}</strong>
        <code>
          {(branchScope?.head ?? reviewHead ?? "working-tree").slice(0, 12)}
        </code>
        <Badge tone={branchRecordError ? "warn" : "good"}>
          {branchRecordError ? "local-only fallback" : "durable local"}
        </Badge>
      </div>
      <div className="review-branch-evidence">
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
      <ol className="review-branch-events">
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
