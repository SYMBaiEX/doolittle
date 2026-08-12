import { useMemo, useState } from "react";
import type {
  ActivityEventKind,
  ActivityExportResponse,
  ActivityFeedResponse,
} from "../shared/contracts";
import { ActivityTimeline } from "./activity/ActivityTimeline";
import {
  ACTIVITY_PAGE_SIZE,
  activityState,
  groupConsecutiveActivityEvents,
  visibleActivityWindow,
} from "./activity/activity-model";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";
import "./observability.css";

type ActivitySource = "all" | ActivityEventKind;

export {
  ACTIVITY_PAGE_SIZE,
  activitySummaryIsDistinct,
  groupConsecutiveActivityEvents,
  visibleActivityWindow,
} from "./activity/activity-model";

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
        description="Agent work, outcomes, and runtime events."
        actions={
          <div className="row-actions">
            <button
              className="secondary-button"
              onClick={() => void exportTimeline()}
              type="button"
              disabled={!active || exporting}
            >
              {exporting ? "Exporting…" : "Export JSON"}
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
            placeholder="Search activity"
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
                label: "Pending",
                tone: overview.live ? "warn" : "neutral",
                value: overview.live,
              },
              {
                label: "Attention",
                tone: overview.attention ? "bad" : "good",
                value: overview.attention,
              },
              { label: "Recorded", value: overview.recorded },
            ]}
          />

          <ActivityTimeline
            filteredCount={filtered.length}
            groups={visibleGroups}
            onShowMore={() =>
              setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)
            }
            remainingGroups={remainingGroups}
            totalCount={rows.length}
          />
        </>
      ) : (
        <EmptyBlock title="No matching events">
          No activity matched the selected source and search.
        </EmptyBlock>
      )}
    </div>
  );
}
