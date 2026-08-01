import { useMemo, useState } from "react";
import "./activity-center.css";

export type ActivityCenterKind =
  | "chat-run"
  | "automation"
  | "delegation"
  | "approval"
  | "delivery";

export type ActivityCenterStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "approved"
  | "denied"
  | "expired"
  | "used"
  | "delivered";

export type ActivityCenterTarget =
  | "chat"
  | "review"
  | "automations"
  | "orchestration";

export interface ActivityCenterEvent {
  id: string;
  kind: ActivityCenterKind;
  sourceId: string;
  sessionId?: string;
  status: ActivityCenterStatus;
  occurredAt: string;
  title: string;
  safeSummary: string;
  target: ActivityCenterTarget;
}

export interface ActivityCenterProps {
  active: boolean;
  events: readonly ActivityCenterEvent[];
  loading: boolean;
  error: string;
  reload: () => void;
  onOpenTarget: (event: ActivityCenterEvent) => void;
}

const INITIAL_VISIBLE_ROWS = 5;
const MAX_EXPANDED_ROWS = 24;

const TARGET_LABELS: Record<ActivityCenterTarget, string> = {
  chat: "Open chat",
  review: "Open review",
  automations: "Open automations",
  orchestration: "Open tasks",
};

const KIND_LABELS: Record<ActivityCenterKind, string> = {
  "chat-run": "Chat",
  automation: "Automation",
  delegation: "Task",
  approval: "Approval",
  delivery: "Delivery",
};

export function activityStatusLabel(
  status: ActivityCenterStatus,
  kind?: ActivityCenterKind,
): string {
  switch (status) {
    case "pending":
      return kind === "approval" ? "Needs review" : "Queued";
    case "running":
      return "In progress";
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "skipped":
      return "Skipped";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    case "used":
      return "Used";
    case "delivered":
      return "Delivered";
  }
}

export function activityTargetLabel(target: ActivityCenterTarget): string {
  return TARGET_LABELS[target];
}

export function activityNeedsAttention(event: ActivityCenterEvent): boolean {
  return (
    event.status === "failed" ||
    event.status === "denied" ||
    (event.kind === "approval" && event.status === "pending")
  );
}

export function orderActivityEvents(
  events: readonly ActivityCenterEvent[],
): ActivityCenterEvent[] {
  const deduped = new Map<string, ActivityCenterEvent>();
  for (const event of events) {
    if (!deduped.has(event.id)) deduped.set(event.id, event);
  }
  return Array.from(deduped.values()).sort((left, right) => {
    const leftTime = Number.isFinite(Date.parse(left.occurredAt))
      ? left.occurredAt
      : "";
    const rightTime = Number.isFinite(Date.parse(right.occurredAt))
      ? right.occurredAt
      : "";
    return rightTime.localeCompare(leftTime) || right.id.localeCompare(left.id);
  });
}

function timestampLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
}

export function ActivityCenter({
  active,
  events,
  loading,
  error,
  reload,
  onOpenTarget,
}: ActivityCenterProps) {
  const [expanded, setExpanded] = useState(false);
  const orderedEvents = useMemo(() => orderActivityEvents(events), [events]);
  const maximumRows = expanded ? MAX_EXPANDED_ROWS : INITIAL_VISIBLE_ROWS;
  const visibleEvents = orderedEvents.slice(0, maximumRows);
  const hiddenCount = Math.max(0, orderedEvents.length - visibleEvents.length);
  const canExpand = !expanded && orderedEvents.length > INITIAL_VISIBLE_ROWS;

  return (
    <section
      aria-busy={active && loading}
      aria-labelledby="activity-center-heading"
      className="activity-center"
      data-active={active}
    >
      <header className="activity-center__header">
        <div className="activity-center__title">
          <span aria-hidden="true" className="activity-center__pulse">
            <i />
          </span>
          <div>
            <span className="eyebrow">Signal queue {"//"}</span>
            <h2 id="activity-center-heading">Recent activity</h2>
          </div>
        </div>
        <button
          className="activity-center__refresh"
          disabled={!active || loading}
          onClick={reload}
          type="button"
        >
          {loading ? "Syncing…" : "Sync"}
        </button>
      </header>

      <p
        aria-live="polite"
        className={`activity-center__state ${error ? "is-error" : ""}`.trim()}
        role="status"
      >
        {error
          ? `Activity is unavailable: ${error}`
          : loading && orderedEvents.length === 0
            ? "Loading recent activity…"
            : orderedEvents.length === 0
              ? "No recent activity."
              : `${orderedEvents.length} recent ${
                  orderedEvents.length === 1 ? "event" : "events"
                }`}
      </p>

      {visibleEvents.length > 0 ? (
        <ol aria-label="Recent activity" className="activity-center__list">
          {visibleEvents.map((event) => {
            const attention = activityNeedsAttention(event);
            return (
              <li
                className={attention ? "needs-attention" : ""}
                data-kind={event.kind}
                key={event.id}
              >
                <span
                  aria-hidden="true"
                  className="activity-center__indicator"
                />
                <div className="activity-center__copy">
                  <div>
                    <strong>{event.title}</strong>
                    <span>{KIND_LABELS[event.kind]}</span>
                    <span>{activityStatusLabel(event.status, event.kind)}</span>
                  </div>
                  <p>{event.safeSummary}</p>
                  <time dateTime={event.occurredAt}>
                    {timestampLabel(event.occurredAt)}
                  </time>
                </div>
                <button
                  className="activity-center__target"
                  onClick={() => onOpenTarget(event)}
                  type="button"
                >
                  {activityTargetLabel(event.target)}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {canExpand ? (
        <button
          aria-expanded={false}
          className="activity-center__more"
          onClick={() => setExpanded(true)}
          type="button"
        >
          Show {Math.min(hiddenCount, MAX_EXPANDED_ROWS - INITIAL_VISIBLE_ROWS)}{" "}
          more
        </button>
      ) : expanded && orderedEvents.length > INITIAL_VISIBLE_ROWS ? (
        <div className="activity-center__more-row">
          {hiddenCount > 0 ? (
            <span className="activity-center__more-summary">
              Showing newest {MAX_EXPANDED_ROWS} of {orderedEvents.length}
            </span>
          ) : null}
          <button
            aria-expanded={true}
            className="activity-center__more"
            onClick={() => setExpanded(false)}
            type="button"
          >
            Show less
          </button>
        </div>
      ) : null}

      {error ? (
        <button
          className="activity-center__retry"
          disabled={!active || loading}
          onClick={reload}
          type="button"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}
