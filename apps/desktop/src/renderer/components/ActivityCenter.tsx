import { useMemo, useState } from "react";

const TEXT_BUTTON_CLASS =
  "w-fit border-0 bg-transparent px-1.5 py-1 font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-50";

export type ActivityCenterKind =
  | "chat-run"
  | "automation"
  | "delegation"
  | "approval"
  | "delivery"
  | "terminal"
  | "repository-change"
  | "codegen"
  | "log";

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
  | "delivered"
  | "recorded";

export type ActivityCenterTarget =
  | "chat"
  | "review"
  | "automations"
  | "orchestration"
  | "terminal"
  | "workspace"
  | "codegen"
  | "operations";

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
  terminal: "Open workspace",
  workspace: "Open workspace",
  codegen: "Open code generation",
  operations: "Open logs",
};

const KIND_LABELS: Record<ActivityCenterKind, string> = {
  "chat-run": "Chat",
  automation: "Automation",
  delegation: "Task",
  approval: "Approval",
  delivery: "Delivery",
  terminal: "Terminal",
  "repository-change": "Workspace",
  codegen: "Codegen",
  log: "Runtime",
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
    case "recorded":
      return "Recorded";
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
      className="grid min-w-0 gap-[7px] rounded-md border border-[color-mix(in_srgb,var(--border)_78%,transparent)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_5%,transparent),transparent_58%),color-mix(in_srgb,var(--surface-raised)_58%,transparent)] p-[9px]"
      data-active={active}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-[7px]">
          <span
            aria-hidden="true"
            className="relative grid size-[25px] place-items-center rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--accent)_20%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
          >
            <i className="size-[5px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_72%,transparent)]" />
            <i className="absolute size-[13px] rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)]" />
          </span>
          <div className="grid gap-px">
            <span className="font-[var(--font-mono)] text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              Signal queue {"//"}
            </span>
            <h2
              className="text-xs font-semibold text-[var(--text)]"
              id="activity-center-heading"
            >
              Recent activity
            </h2>
          </div>
        </div>
        <button
          className={`${TEXT_BUTTON_CLASS} rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--border)_74%,transparent)] uppercase tracking-[0.06em]`}
          disabled={!active || loading}
          onClick={reload}
          type="button"
        >
          {loading ? "Syncing…" : "Sync"}
        </button>
      </header>

      <p
        aria-live="polite"
        className={`m-0 min-h-3.5 font-[var(--font-mono)] text-[8px] leading-[1.3] uppercase tracking-[0.03em] ${
          error ? "text-[var(--bad)]" : "text-[var(--faint)]"
        }`}
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
        <ol
          aria-label="Recent activity"
          className="grid max-h-[228px] overflow-y-auto overscroll-contain border-t border-[var(--border)] [scrollbar-gutter:stable]"
        >
          {visibleEvents.map((event) => {
            const attention = activityNeedsAttention(event);
            return (
              <li
                className="grid min-w-0 grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--border)] px-[3px] py-[7px] max-[680px]:grid-cols-[7px_minmax(0,1fr)]"
                data-needs-attention={attention}
                data-kind={event.kind}
                key={event.id}
              >
                <span
                  aria-hidden="true"
                  className={`size-[5px] rounded-full ${
                    attention
                      ? "bg-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
                      : "bg-[var(--faint)]"
                  }`}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-[var(--text)]">
                      {event.title}
                    </strong>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--faint)]">
                      {KIND_LABELS[event.kind]}
                    </span>
                    <span
                      className={`overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)] text-[var(--text-meta)] ${
                        attention
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {activityStatusLabel(event.status, event.kind)}
                    </span>
                  </div>
                  <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-meta)] text-[var(--muted)]">
                    {event.safeSummary}
                  </p>
                  <time
                    className="font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--faint)]"
                    dateTime={event.occurredAt}
                  >
                    {timestampLabel(event.occurredAt)}
                  </time>
                </div>
                <button
                  className={`${TEXT_BUTTON_CLASS} whitespace-nowrap uppercase tracking-[0.05em] text-[var(--faint)] max-[680px]:col-start-2 max-[680px]:justify-self-start max-[680px]:pl-0`}
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
          className={TEXT_BUTTON_CLASS}
          onClick={() => setExpanded(true)}
          type="button"
        >
          Show {Math.min(hiddenCount, MAX_EXPANDED_ROWS - INITIAL_VISIBLE_ROWS)}{" "}
          more
        </button>
      ) : expanded && orderedEvents.length > INITIAL_VISIBLE_ROWS ? (
        <div className="flex items-center justify-between gap-2.5">
          {hiddenCount > 0 ? (
            <span className="text-[var(--text-meta)] text-[var(--faint)]">
              Showing newest {MAX_EXPANDED_ROWS} of {orderedEvents.length}
            </span>
          ) : null}
          <button
            aria-expanded={true}
            className={TEXT_BUTTON_CLASS}
            onClick={() => setExpanded(false)}
            type="button"
          >
            Show less
          </button>
        </div>
      ) : null}

      {error ? (
        <button
          className={`${TEXT_BUTTON_CLASS} text-[var(--bad)]`}
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
