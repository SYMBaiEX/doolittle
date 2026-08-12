import { useMemo, useState } from "react";
import type {
  ActivityEvent,
  ActivityEventKind,
  ActivityExportResponse,
  ActivityFeedResponse,
} from "../shared/contracts";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { progressiveWindow } from "./components/progressive-window";
import {
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";

type ActivitySource = "all" | ActivityEventKind;

export const ACTIVITY_PAGE_SIZE = 20;

export function visibleActivityWindow<T>(
  events: readonly T[],
  visibleCount: number,
): readonly T[] {
  return progressiveWindow(events, {
    pageSize: ACTIVITY_PAGE_SIZE,
    requested: visibleCount,
  }).visible;
}

export function activitySummaryIsDistinct(
  title: string,
  summary: string,
): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[\s.!?;:]+$/u, "");
  return Boolean(summary.trim()) && normalize(summary) !== normalize(title);
}

interface GroupableActivityEvent {
  id: string;
  kind: string;
  safeSummary: string;
  status: string;
  target: string;
  title: string;
}

interface ActivityEventGroup<T> {
  count: number;
  event: T;
  summary: string;
}

const COMPLETED_CHAT_RUN_SUMMARY =
  /^Chat run completed with (?<actions>\d+) recorded actions?\.$/u;

function completedChatRunActions(event: GroupableActivityEvent): number | null {
  if (
    event.kind !== "chat-run" ||
    event.status !== "succeeded" ||
    event.title !== "Chat run completed"
  ) {
    return null;
  }
  const actions = COMPLETED_CHAT_RUN_SUMMARY.exec(event.safeSummary)?.groups
    ?.actions;
  return actions === undefined ? null : Number.parseInt(actions, 10);
}

export function groupConsecutiveActivityEvents<
  T extends GroupableActivityEvent,
>(events: readonly T[]): Array<ActivityEventGroup<T>> {
  const groups: Array<ActivityEventGroup<T> & { recordedActions?: number }> =
    [];
  for (const event of events) {
    const previous = groups.at(-1);
    const exactMatch =
      previous?.event.kind === event.kind &&
      previous.event.safeSummary === event.safeSummary &&
      previous.event.status === event.status &&
      previous.event.target === event.target &&
      previous.event.title === event.title;
    const eventActions = completedChatRunActions(event);
    const aggregatesCompletedChatRuns =
      previous?.recordedActions !== undefined &&
      eventActions !== null &&
      previous.event.kind === event.kind &&
      previous.event.status === event.status &&
      previous.event.target === event.target &&
      previous.event.title === event.title;
    if (previous && (exactMatch || aggregatesCompletedChatRuns)) {
      previous.count += 1;
      if (aggregatesCompletedChatRuns) {
        previous.recordedActions =
          (previous.recordedActions ?? 0) + eventActions;
        previous.summary = `${previous.count} chat runs completed with ${previous.recordedActions} recorded ${previous.recordedActions === 1 ? "action" : "actions"}.`;
      }
    } else {
      groups.push({
        count: 1,
        event,
        summary: event.safeSummary,
        ...(eventActions === null ? {} : { recordedActions: eventActions }),
      });
    }
  }
  return groups.map(({ count, event, summary }) => ({ count, event, summary }));
}

const SOURCE_LABELS: Record<ActivityEventKind, string> = {
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

function activityTone(
  event: ActivityEvent,
): "good" | "warn" | "bad" | "neutral" {
  if (event.status === "failed" || event.status === "denied") return "bad";
  if (event.status === "pending" || event.status === "running") return "warn";
  return "neutral";
}

function activityState(event: ActivityEvent): {
  severity: "info" | "warning" | "critical";
  liveness: "live" | "settled";
} {
  if (event.status === "failed" || event.status === "denied") {
    return { severity: "critical", liveness: "settled" };
  }
  if (event.status === "pending" || event.status === "running") {
    return { severity: "warning", liveness: "live" };
  }
  return { severity: "info", liveness: "settled" };
}

export function ActivityPage({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ActivitySource>("all");
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const timeline = useApiResource<ActivityFeedResponse>(
    active ? "/activity?limit=200" : null,
    [active],
  );
  const rows = timeline.data?.events ?? [];

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (source !== "all" && row.kind !== source) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        row.title,
        row.safeSummary,
        row.kind,
        row.status,
        row.target,
        row.occurredAt,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [rows, source, query]);

  const overview = useMemo(() => {
    const needsAttention = (row: (typeof rows)[number]) =>
      activityState(row).severity === "critical";
    const attention = rows.filter(needsAttention).length;
    const live = rows.filter(
      (row) => activityState(row).liveness === "live" && !needsAttention(row),
    ).length;
    return {
      live,
      attention,
      recorded: Math.max(0, rows.length - live - attention),
    };
  }, [rows]);

  const loading = timeline.loading;
  const errors = timeline.error ? [timeline.error] : [];
  const grouped = useMemo(
    () => groupConsecutiveActivityEvents(filtered),
    [filtered],
  );
  const visibleGroups = visibleActivityWindow(grouped, visibleCount);
  const remainingGroups = Math.max(0, grouped.length - visibleGroups.length);

  const exportTimeline = async () => {
    if (!active || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (source !== "all") params.set("kind", source);
      const exported = await desktopRequest<ActivityExportResponse>(
        `/activity/export?${params.toString()}`,
      );
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `doolittle-activity-${exported.generatedAt.replaceAll(":", "-")}.json`;
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setExportError(`Activity export failed: ${errorMessage(cause)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page studio-page activity-page">
      <PageHeader
        eyebrow="Operator"
        title="Activity"
        description="Agent work, outcomes, and runtime events in one timeline."
        actions={
          <div className="row-actions">
            <button
              className="secondary-button"
              onClick={() => void exportTimeline()}
              type="button"
              disabled={!active || exporting}
            >
              {exporting ? "Exporting…" : "Export safe JSON"}
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                timeline.reload();
              }}
              type="button"
              disabled={!active}
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="filter-bar activity-filter-bar">
        <label className="search-field" htmlFor="activity-query">
          <span className="sr-only">Search operator activity</span>
          <input
            id="activity-query"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(ACTIVITY_PAGE_SIZE);
            }}
            placeholder="Search actions, outcomes, routes, or status"
            disabled={!active}
          />
        </label>
        <label htmlFor="activity-source" className="activity-filter">
          <span className="sr-only">Activity source</span>
          <select
            id="activity-source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value as ActivitySource);
              setVisibleCount(ACTIVITY_PAGE_SIZE);
            }}
            disabled={!active}
          >
            <option value="all">All sources</option>
            <option value="chat-run">Chat runs</option>
            <option value="automation">Automations</option>
            <option value="delegation">Agent tasks</option>
            <option value="approval">Approvals</option>
            <option value="delivery">Deliveries</option>
            <option value="terminal">Terminal</option>
            <option value="repository-change">Workspace changes</option>
            <option value="codegen">Generation runs</option>
            <option value="log">Runtime logs</option>
          </select>
        </label>
      </div>

      {active
        ? errors.map((error) => (
            <ErrorBlock key={String(error)} error={error as string} />
          ))
        : null}
      {active && exportError ? <Notice tone="bad">{exportError}</Notice> : null}
      <div aria-live="polite" className="sr-only" role="status">
        {!active
          ? "Activity is unavailable until the local runtime is ready."
          : loading
            ? "Loading activity sources."
            : `${filtered.length} activity ${
                filtered.length === 1 ? "event" : "events"
              } loaded.`}
      </div>

      {!active ? (
        <OfflineRouteState>
          Activity history is unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : loading ? (
        <LoadingBlock label="Loading activity sources…" />
      ) : filtered.length ? (
        <>
          <CompactStatStrip
            label="Activity overview"
            stats={[
              {
                label: "Pending signals",
                tone: overview.live ? "warn" : "neutral",
                value: overview.live,
              },
              {
                label: "Needs attention",
                tone: overview.attention ? "bad" : "good",
                value: overview.attention,
              },
              { label: "Recorded", value: overview.recorded },
            ]}
          />

          <section className="content-card activity-feed">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Operator stream</span>
                <h2>What happened</h2>
              </div>
              <small>
                {visibleGroups.length} visible
                {grouped.length !== filtered.length
                  ? ` · ${filtered.length} events`
                  : rows.length !== filtered.length
                    ? ` of ${rows.length}`
                    : ""}
              </small>
            </div>

            <ol className="activity-event-list">
              {visibleGroups.map(({ count, event: row, summary }) => {
                const tone = activityTone(row);
                const state = activityState(row);
                return (
                  <li key={row.id}>
                    <article
                      className={`activity-entry severity-${state.severity} liveness-${state.liveness}`}
                    >
                      <div className="activity-entry-rail" aria-hidden="true">
                        <i className="activity-entry-dot" />
                      </div>
                      <div className="activity-entry-body">
                        <header className="activity-entry-head">
                          <div className="activity-entry-meta">
                            <span className={`activity-source is-${tone}`}>
                              {SOURCE_LABELS[row.kind]}
                            </span>
                            <span className="activity-event-context">
                              {row.status} · {row.target}
                              {count > 1 ? ` · ${count} events` : ""}
                            </span>
                          </div>
                          <time dateTime={row.occurredAt}>
                            {displayTimestamp(row.occurredAt)}
                          </time>
                        </header>

                        <p className="activity-sentence">
                          <strong>{row.title}</strong>
                        </p>
                        {activitySummaryIsDistinct(row.title, summary) ? (
                          <p className="activity-outcome">{summary}</p>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
            {remainingGroups ? (
              <footer className="activity-feed-more">
                <span>{remainingGroups} older groups</span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)
                  }
                  type="button"
                >
                  Show next {Math.min(ACTIVITY_PAGE_SIZE, remainingGroups)}
                </button>
              </footer>
            ) : null}
          </section>
        </>
      ) : (
        <EmptyBlock title="No matching events">
          No activity matched the selected source and search.
        </EmptyBlock>
      )}
    </div>
  );
}
