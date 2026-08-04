import { useMemo, useState } from "react";
import {
  type ActivitySource,
  activityTone,
  buildActivityEvents,
} from "./activity-events";
import {
  asArray,
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  useApiResource,
} from "./lib";

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

interface LogsResponse {
  logs?: unknown[];
}

interface ApprovalsResponse {
  approvals?: unknown[];
}

interface RepositoryChangesResponse {
  changes?: unknown[];
}

interface DelegationTasksResponse {
  tasks?: unknown[];
}

interface CodegenRunsResponse {
  runs?: unknown[];
}

export function ActivityPage({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ActivitySource>("all");

  const deliveries = useApiResource<DeliveriesResponse>(
    active ? "/deliveries" : null,
    [active],
  );
  const terminal = useApiResource<TerminalHistoryResponse>(
    active ? "/terminal/history" : null,
    [active],
  );
  const logs = useApiResource<LogsResponse>(active ? "/logs?limit=100" : null, [
    active,
  ]);
  const approvals = useApiResource<ApprovalsResponse>(
    active ? "/execution/approvals" : null,
    [active],
  );
  const changes = useApiResource<RepositoryChangesResponse>(
    active ? "/repo/changes" : null,
    [active],
  );
  const tasks = useApiResource<DelegationTasksResponse>(
    active ? "/delegation/tasks?limit=100" : null,
    [active],
  );
  const runs = useApiResource<CodegenRunsResponse>(
    active ? "/codegen/runs" : null,
    [active],
  );

  const rows = useMemo(() => {
    return buildActivityEvents({
      deliveries: asArray(deliveries.data?.deliveries),
      terminal: asArray(terminal.data?.commands),
      logs: asArray(logs.data?.logs),
      approvals: asArray(approvals.data?.approvals),
      changes: asArray(changes.data?.changes),
      tasks: asArray(tasks.data?.tasks),
      runs: asArray(runs.data?.runs),
    });
  }, [
    approvals.data,
    changes.data,
    deliveries.data,
    logs.data,
    runs.data,
    tasks.data,
    terminal.data,
  ]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (source !== "all" && row.kind !== source) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        row.verb,
        row.object,
        row.outcome,
        row.context,
        row.source,
        row.status,
        row.severity,
        row.liveness,
        row.at,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [rows, source, query]);

  const overview = useMemo(() => {
    const needsAttention = (row: (typeof rows)[number]) =>
      row.severity === "critical" ||
      (row.severity === "warning" && row.liveness === "live");
    const attention = rows.filter(needsAttention).length;
    const live = rows.filter(
      (row) => row.liveness === "live" && !needsAttention(row),
    ).length;
    return {
      live,
      attention,
      recorded: Math.max(0, rows.length - live - attention),
    };
  }, [rows]);

  const resources = [
    deliveries,
    terminal,
    logs,
    approvals,
    changes,
    tasks,
    runs,
  ];
  const loading = resources.some((resource) => resource.loading);
  const errors = resources.map((resource) => resource.error).filter(Boolean);

  return (
    <div className="page studio-page activity-page">
      <PageHeader
        eyebrow="Operator"
        title="Activity"
        description="A human-readable account of what Doolittle did, what it touched, and how each operation ended."
        actions={
          <button
            className="secondary-button"
            onClick={() => {
              deliveries.reload();
              terminal.reload();
              logs.reload();
              approvals.reload();
              changes.reload();
              tasks.reload();
              runs.reload();
            }}
            type="button"
            disabled={!active}
          >
            Refresh
          </button>
        }
      />

      <div className="filter-bar activity-filter-bar">
        <label className="search-field" htmlFor="activity-query">
          <span className="sr-only">Search operator activity</span>
          <input
            id="activity-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions, files, commands, outcomes, or status"
            disabled={!active}
          />
        </label>
        <label htmlFor="activity-source" className="activity-filter">
          <span className="sr-only">Activity source</span>
          <select
            id="activity-source"
            value={source}
            onChange={(event) =>
              setSource(event.target.value as ActivitySource)
            }
            disabled={!active}
          >
            <option value="all">All sources</option>
            <option value="delivery">Deliveries</option>
            <option value="terminal">Terminal</option>
            <option value="log">Logs</option>
            <option value="approval">Approvals</option>
            <option value="change">Workspace changes</option>
            <option value="task">Agent tasks</option>
            <option value="run">Generation runs</option>
          </select>
        </label>
      </div>

      {errors.map((error) => (
        <ErrorBlock key={String(error)} error={error as string} />
      ))}
      <div aria-live="polite" className="sr-only" role="status">
        {loading
          ? "Loading activity sources."
          : `${filtered.length} activity ${
              filtered.length === 1 ? "event" : "events"
            } loaded.`}
      </div>

      {loading ? (
        <LoadingBlock label="Loading activity sources…" />
      ) : filtered.length ? (
        <>
          <section
            aria-label="Activity overview"
            className="activity-summary-strip"
          >
            <div className="activity-summary-item">
              <i className="activity-summary-signal live" aria-hidden="true" />
              <span>Live now</span>
              <strong>{overview.live}</strong>
            </div>
            <div className="activity-summary-item">
              <i
                className="activity-summary-signal attention"
                aria-hidden="true"
              />
              <span>Needs attention</span>
              <strong>{overview.attention}</strong>
            </div>
            <div className="activity-summary-item">
              <i
                className="activity-summary-signal settled"
                aria-hidden="true"
              />
              <span>Recorded</span>
              <strong>{overview.recorded}</strong>
            </div>
          </section>

          <section className="content-card activity-feed">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Operator stream</span>
                <h2>What happened</h2>
              </div>
              <small>
                {filtered.length} visible
                {rows.length !== filtered.length ? ` of ${rows.length}` : ""}
              </small>
            </div>

            <ol className="activity-event-list">
              {filtered.map((row) => {
                const tone = activityTone(row);
                return (
                  <li key={row.id}>
                    <article
                      className={`activity-entry severity-${row.severity} liveness-${row.liveness}`}
                    >
                      <div className="activity-entry-rail" aria-hidden="true">
                        <i className="activity-entry-dot" />
                      </div>
                      <div className="activity-entry-body">
                        <header className="activity-entry-head">
                          <div className="activity-entry-meta">
                            <Badge tone={tone}>{row.source}</Badge>
                            <Badge tone="neutral">{row.status}</Badge>
                            <span className="activity-liveness">
                              <i
                                className="activity-liveness-signal"
                                aria-hidden="true"
                              />
                              {row.liveness === "live"
                                ? "Live"
                                : row.liveness === "snapshot"
                                  ? "Current state"
                                  : "Settled"}
                            </span>
                          </div>
                          <time dateTime={row.at || undefined}>
                            {row.at
                              ? displayTimestamp(row.at)
                              : "Current workspace state"}
                          </time>
                        </header>

                        <p className="activity-sentence">
                          <strong>{row.verb}</strong> <span>{row.object}</span>
                        </p>
                        <p className="activity-outcome">{row.outcome}</p>
                        {row.context ? (
                          <p className="activity-context">{row.context}</p>
                        ) : null}

                        <details className="activity-disclosure">
                          <summary>
                            Inspect details
                            {row.relatedCount > 1
                              ? ` · ${row.relatedCount} related records`
                              : ""}
                          </summary>
                          <div className="activity-detail-panel">
                            <dl className="activity-structured-details">
                              <div className="activity-detail-row">
                                <dt>Action</dt>
                                <dd>
                                  {row.verb} {row.object}
                                </dd>
                              </div>
                              <div className="activity-detail-row">
                                <dt>Outcome</dt>
                                <dd>{row.outcome}</dd>
                              </div>
                              <div className="activity-detail-row">
                                <dt>State</dt>
                                <dd>
                                  {row.status} · {row.severity} · {row.liveness}
                                </dd>
                              </div>
                              {row.lifecycle ? (
                                <div className="activity-detail-row">
                                  <dt>Lifecycle</dt>
                                  <dd>{row.lifecycle}</dd>
                                </div>
                              ) : null}
                              {row.context ? (
                                <div className="activity-detail-row">
                                  <dt>Context</dt>
                                  <dd>{row.context}</dd>
                                </div>
                              ) : null}
                            </dl>
                            <div className="activity-raw-details">
                              <span className="eyebrow">Raw event</span>
                              <pre className="json-preview">{row.raw}</pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
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
