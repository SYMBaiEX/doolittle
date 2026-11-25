import { Button, Input } from "@doolittle/ui";
import { useMemo, useRef, useState } from "react";
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
  useDebouncedValue,
} from "./lib";
import {
  OBSERVABILITY_CONTROL_CLASS,
  OBSERVABILITY_FILTER_CLASS,
  OBSERVABILITY_PAGE_CLASS,
} from "./observability-layout";

type ActivitySource = "all" | ActivityEventKind;

export {
  ACTIVITY_PAGE_SIZE,
  activitySummaryIsDistinct,
  groupConsecutiveActivityEvents,
  visibleActivityWindow,
} from "./activity/activity-model";

export function ActivityPage({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ActivitySource>("all");
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportTruncated, setExportTruncated] = useState(false);

  const debouncedQuery = useDebouncedValue(query.trim());
  const params = new URLSearchParams({ limit: "200" });
  if (source !== "all") params.set("kind", source);
  if (debouncedQuery) params.set("query", debouncedQuery);
  const filterParams = params.toString();
  const timeline = useApiResource<ActivityFeedResponse>(
    active ? `/activity?${filterParams}` : null,
    [active],
  );
  const rows = timeline.data?.events ?? [];
  const searchPending = query.trim() !== debouncedQuery;
  const hasFilters = Boolean(query.trim() || source !== "all");

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

  const loading = timeline.loading || searchPending;
  const errors = timeline.error ? [timeline.error] : [];
  const grouped = useMemo(() => groupConsecutiveActivityEvents(rows), [rows]);
  const visibleGroups = visibleActivityWindow(grouped, visibleCount);
  const remainingGroups = Math.max(0, grouped.length - visibleGroups.length);

  const exportTimeline = async () => {
    if (!active || exporting || loading || !rows.length) return;
    setExporting(true);
    setExportError("");
    setExportTruncated(false);
    try {
      const exported = await desktopRequest<ActivityExportResponse>(
        `/activity/export?${filterParams}`,
      );
      const blob = new Blob([JSON.stringify(exported)], {
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
      setExportTruncated(exported.truncated);
    } catch (cause) {
      setExportError(`Activity export failed: ${errorMessage(cause)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={OBSERVABILITY_PAGE_CLASS} data-activity-page="true">
      <PageHeader
        eyebrow="Operator"
        title="Activity"
        description="Agent work, outcomes, and runtime events."
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void exportTimeline()}
              type="button"
              disabled={!active || exporting || loading || !rows.length}
              variant="outline"
            >
              {exporting
                ? "Exporting…"
                : hasFilters
                  ? "Export matches"
                  : "Export JSON"}
            </Button>
            <Button
              onClick={() => {
                timeline.reload();
              }}
              type="button"
              disabled={!active}
              variant="outline"
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className={OBSERVABILITY_FILTER_CLASS}>
        <label htmlFor="activity-query">
          <span className="sr-only">Search operator activity</span>
          <Input
            ref={searchInputRef}
            className="h-[34px]"
            id="activity-query"
            maxLength={256}
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
        <label htmlFor="activity-source">
          <span className="sr-only">Activity source</span>
          <select
            id="activity-source"
            className={OBSERVABILITY_CONTROL_CLASS}
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
      {active && exportTruncated ? (
        <Notice tone="warn">
          The export reached its size limit. Narrow the filters to include more
          of the events you need.
        </Notice>
      ) : null}
      <div aria-live="polite" className="sr-only" role="status">
        {!active
          ? "Activity is unavailable until the local runtime is ready."
          : loading
            ? "Loading activity sources."
            : `${rows.length} activity ${
                rows.length === 1 ? "event" : "events"
              } loaded.`}
      </div>

      {!active ? (
        <OfflineRouteState>
          Activity history is unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : loading ? (
        <LoadingBlock label="Loading activity sources…" />
      ) : rows.length ? (
        <>
          <CompactStatStrip
            className="@max-[420px]/observability:grid-cols-3 @max-[420px]/observability:gap-x-2"
            label={
              hasFilters ? "Matching activity overview" : "Activity overview"
            }
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
            eventCount={rows.length}
            groups={visibleGroups}
            onShowMore={() =>
              setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)
            }
            remainingGroups={remainingGroups}
          />
        </>
      ) : !timeline.error ? (
        <EmptyBlock
          title={
            query.trim() || source !== "all"
              ? "No matching events"
              : "No recorded activity yet"
          }
          actions={
            query.trim() || source !== "all" ? (
              <Button
                onClick={() => {
                  setQuery("");
                  setSource("all");
                  setVisibleCount(ACTIVITY_PAGE_SIZE);
                  searchInputRef.current?.focus();
                }}
                type="button"
                variant="secondary"
              >
                Clear filters
              </Button>
            ) : undefined
          }
        >
          {query.trim() || source !== "all"
            ? "No activity matched the selected source and search."
            : "Conversation runs and workspace operations will appear here."}
        </EmptyBlock>
      ) : null}
    </div>
  );
}
