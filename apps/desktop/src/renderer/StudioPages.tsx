import {
  type FormEvent,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ActivitySource,
  activityTone,
  buildActivityEvents,
} from "./activity-events";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import {
  canRecallSavedProfileMatches,
  freezeMemoryMatchSnapshot,
  type MemoryMatchesResponse,
  normalizeSavedProfileMatches,
} from "./memory-matches";

const BOUNDS = {
  memorySnapshotChars: 1_400,
  mediaResultChars: 2_400,
  memoryPreviewItems: 5,
  agentCardChars: 1_000,
};

const DESKTOP_PROFILE_USER_ID = "desktop-user";

interface MemorySummary {
  target?: "memory" | "user" | string;
  entries?: number;
  characters?: number;
  preview?: unknown[];
}

interface MemoryResponse {
  target?: string;
  summary?: MemorySummary;
  snapshot?: string;
}

interface ProfileSummaryResponse {
  summary?: UnknownRecord;
}

interface AgentProfileResponse {
  card?: unknown;
  summary?: UnknownRecord;
}

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

interface AnalyzeResponse {
  analysis?: UnknownRecord;
}

interface InspectResponse {
  media?: UnknownRecord;
}

interface TranscribeResponse {
  transcription?: UnknownRecord;
}

interface SpeakResponse {
  speech?: UnknownRecord;
}

interface GenerateResponse {
  generation?: UnknownRecord;
}

function boundedText(value: string, max: number): string {
  return value.length <= max
    ? value
    : `${value.slice(0, max)}
… (${value.length - max} more chars)`;
}

function renderText(value: unknown, max = BOUNDS.mediaResultChars): string {
  if (typeof value === "string") return boundedText(value, max);
  try {
    return boundedText(JSON.stringify(value, null, 2), max);
  } catch {
    return boundedText(String(value), max);
  }
}

async function chooseLocalMediaFile(
  onSelect: (path: string) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const selection = await window.doolittle.pickFiles();
    const selected = selection.paths[0];
    if (!selection.canceled && selected) onSelect(selected);
  } catch (error) {
    onError(errorMessage(error));
  }
}

export function MemoryPage({ active }: { active: boolean }) {
  const tabs = ["memory", "user"] as const;
  const [target, setTarget] = useState<(typeof tabs)[number]>("memory");
  const [recallDraft, setRecallDraft] = useState("");
  const [submittedRecallQuery, setSubmittedRecallQuery] = useState("");
  const memoryResource = useApiResource<MemoryResponse>(
    active ? "/memory?target=memory" : null,
    [active],
  );
  const userResource = useApiResource<MemoryResponse>(
    active ? "/memory?target=user" : null,
    [active],
  );
  const resource = target === "memory" ? memoryResource : userResource;
  const targetLabel = target === "memory" ? "Shared memory" : "User memory";
  const summary = asRecord(resource.data?.summary) as MemorySummary;
  const snapshot = asString(resource.data?.snapshot, "");
  const preview = asArray(summary.preview)
    .slice(-BOUNDS.memoryPreviewItems)
    .map((entry) => asString(entry));
  const profileSummaryResource = useApiResource<ProfileSummaryResponse>(
    active ? "/profiles/summary" : null,
    [active],
  );
  const agentProfileResource = useApiResource<AgentProfileResponse>(
    active ? "/profiles/agent" : null,
    [active],
  );
  const recallResource = useApiResource<MemoryMatchesResponse>(
    active && canRecallSavedProfileMatches(submittedRecallQuery)
      ? `/profiles/users/recall?userId=${encodeURIComponent(
          DESKTOP_PROFILE_USER_ID,
        )}&query=${encodeURIComponent(submittedRecallQuery)}`
      : null,
    [active, submittedRecallQuery],
  );
  const profileSummary = asRecord(profileSummaryResource.data?.summary);
  const agentCard = renderText(
    agentProfileResource.data?.card,
    BOUNDS.agentCardChars,
  );
  const recallMatches = normalizeSavedProfileMatches(recallResource.data);
  const recallSnapshot = freezeMemoryMatchSnapshot(
    recallDraft,
    submittedRecallQuery,
    recallMatches,
  );
  const submittedRecallTooShort =
    submittedRecallQuery.length > 0 &&
    !canRecallSavedProfileMatches(submittedRecallQuery);

  const tabRefs = useRef<
    Record<(typeof tabs)[number], HTMLButtonElement | null>
  >({
    memory: null,
    user: null,
  });

  const moveTab = (direction: -1 | 1) => {
    const index = tabs.indexOf(target);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    setTarget(next);
    requestAnimationFrame(() => {
      tabRefs.current[next]?.focus();
    });
  };

  const submitRecall = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedRecallQuery(recallDraft.trim());
  };

  return (
    <div className="page studio-page memory-page">
      <PageHeader
        eyebrow="Operator Workspace"
        title="Memory"
        description="Read memory snapshots for shared and user targets, with explicit load states and bounded previews."
        actions={
          <button
            className="secondary-button"
            onClick={resource.reload}
            type="button"
            disabled={!active}
          >
            Refresh
          </button>
        }
      />
      <div
        aria-label="Memory target selector"
        className="memory-tabs"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            ref={(node) => {
              tabRefs.current[tab] = node;
            }}
            role="tab"
            id={`memory-tab-${tab}`}
            aria-selected={target === tab}
            aria-controls="memory-target-panel"
            className={`text-button ${target === tab ? "selected" : ""}`}
            type="button"
            tabIndex={target === tab ? 0 : -1}
            onClick={() => setTarget(tab)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTab(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTab(1);
              }
            }}
          >
            {tab === "memory" ? "Shared memory" : "User memory"}
          </button>
        ))}
      </div>

      <section id="memory-target-panel" aria-live="polite">
        {resource.loading ? (
          <LoadingBlock label={`Loading ${target} memory snapshot…`} />
        ) : resource.error ? (
          <ErrorBlock error={resource.error} retry={resource.reload} />
        ) : resource.data ? (
          <div className="memory-content two-column-grid">
            <section className="content-card memory-summary-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Summary</span>
                  <h2>{targetLabel}</h2>
                </div>
                <Badge>{target === "memory" ? "Shared" : "User"}</Badge>
              </div>
              <div className="card-grid">
                <MetricCard
                  label="Entries"
                  value={asNumber(summary.entries, 0)}
                />
                <MetricCard
                  label="Characters"
                  value={asNumber(summary.characters, 0)}
                />
                <MetricCard
                  label="Target"
                  value={
                    asString(summary.target, target) === "memory"
                      ? "Shared"
                      : "User"
                  }
                />
              </div>
            </section>

            <section className="content-card memory-summary-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Recent entries</span>
                  <h2>Preview</h2>
                </div>
              </div>
              {preview.length ? (
                <ul>
                  {preview.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : (
                <EmptyBlock title="No entries">
                  No memory entries were found.
                </EmptyBlock>
              )}
            </section>

            <section className="content-card memory-summary-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Readable snapshot</span>
                  <h2>Latest bounded snapshot</h2>
                </div>
                <Notice tone={snapshot ? "good" : "warn"}>
                  {snapshot ? "Loaded" : "Unavailable"}
                </Notice>
              </div>
              {snapshot ? (
                <pre className="json-preview">
                  {boundedText(snapshot, BOUNDS.memorySnapshotChars)}
                </pre>
              ) : (
                <EmptyBlock title="No snapshot">Snapshot is empty.</EmptyBlock>
              )}
            </section>

            <section className="content-card memory-summary-card memory-operator-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Operator recall</span>
                  <h2>Profile search</h2>
                </div>
                <Badge tone={submittedRecallTooShort ? "warn" : "neutral"}>
                  {recallSnapshot
                    ? `${recallSnapshot.count} match${
                        recallSnapshot.count === 1 ? "" : "es"
                      }`
                    : "Desktop user"}
                </Badge>
              </div>
              <form className="memory-recall-form" onSubmit={submitRecall}>
                <label>
                  <span className="sr-only">Recall query</span>
                  <input
                    type="text"
                    value={recallDraft}
                    onChange={(event) => setRecallDraft(event.target.value)}
                    placeholder="Search saved profile details"
                  />
                </label>
                <button
                  className="secondary-button"
                  type="submit"
                  disabled={!active || !recallDraft.trim()}
                >
                  Recall
                </button>
              </form>
              {submittedRecallTooShort ? (
                <Notice tone="warn">
                  Use at least {4} characters so recall stays specific.
                </Notice>
              ) : recallResource.loading ? (
                <LoadingBlock label="Recalling saved profile matches…" />
              ) : recallResource.error ? (
                <ErrorBlock
                  error={recallResource.error}
                  retry={recallResource.reload}
                />
              ) : recallMatches.length ? (
                <ul className="memory-match-list">
                  {recallMatches.map((match) => (
                    <li key={`${match.kind}:${match.value}`}>
                      <Badge>{match.kind}</Badge>
                      <span>{match.value}</span>
                    </li>
                  ))}
                </ul>
              ) : submittedRecallQuery ? (
                <EmptyBlock title="No recalled matches">
                  No saved profile details matched this query.
                </EmptyBlock>
              ) : (
                <Notice>
                  Search the saved profile memory for the current desktop user.
                </Notice>
              )}
            </section>

            <section className="content-card memory-summary-card memory-operator-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Profile workspace</span>
                  <h2>Rolodex summary</h2>
                </div>
                <Badge>{asString(profileSummary.agentName, "Doolittle")}</Badge>
              </div>
              {profileSummaryResource.loading ? (
                <LoadingBlock label="Loading profile summary…" />
              ) : profileSummaryResource.error ? (
                <ErrorBlock
                  error={profileSummaryResource.error}
                  retry={profileSummaryResource.reload}
                />
              ) : (
                <div className="card-grid">
                  <MetricCard
                    label="Profiles"
                    value={asNumber(profileSummary.totalProfiles, 0)}
                  />
                  <MetricCard
                    label="Beliefs"
                    value={asNumber(profileSummary.totalBeliefs, 0)}
                  />
                  <MetricCard
                    label="Trusted"
                    value={asNumber(profileSummary.trustedRelationships, 0)}
                  />
                  <MetricCard
                    label="Engaged"
                    value={asNumber(profileSummary.engagedProfiles, 0)}
                  />
                </div>
              )}
            </section>

            <section className="content-card memory-summary-card memory-agent-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Agent profile</span>
                  <h2>Operator card</h2>
                </div>
                <button
                  className="text-button"
                  onClick={agentProfileResource.reload}
                  type="button"
                  disabled={!active}
                >
                  Refresh card
                </button>
              </div>
              {agentProfileResource.loading ? (
                <LoadingBlock label="Loading agent profile…" />
              ) : agentProfileResource.error ? (
                <ErrorBlock
                  error={agentProfileResource.error}
                  retry={agentProfileResource.reload}
                />
              ) : agentCard ? (
                <pre className="json-preview">{agentCard}</pre>
              ) : (
                <EmptyBlock title="No agent card">
                  The runtime did not return an agent profile card.
                </EmptyBlock>
              )}
            </section>
          </div>
        ) : (
          <EmptyBlock
            title={
              active
                ? "Memory is ready for its first entry"
                : "Memory is offline"
            }
            actions={
              <button
                className="secondary-button"
                disabled={!active}
                onClick={resource.reload}
                type="button"
              >
                Refresh memory
              </button>
            }
          >
            {active
              ? "Start a conversation or save an operator detail, then refresh this workspace."
              : "Restart the local runtime to load shared and user memory."}
          </EmptyBlock>
        )}
      </section>
    </div>
  );
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

function InspectAnalyzeTab({
  path,
  setPath,
  inspectBusy,
  setInspectBusy,
  inspectError,
  setInspectError,
  analyzeBusy,
  setAnalyzeBusy,
  analyzeError,
  setAnalyzeError,
  analyzeFocus,
  setAnalyzeFocus,
  inspectResult,
  setInspectResult,
  analyzeResult,
  setAnalyzeResult,
}: {
  path: string;
  setPath: (next: string) => void;
  inspectBusy: boolean;
  setInspectBusy: (value: boolean) => void;
  inspectError: string;
  setInspectError: (value: string) => void;
  analyzeBusy: boolean;
  setAnalyzeBusy: (value: boolean) => void;
  analyzeError: string;
  setAnalyzeError: (value: string) => void;
  analyzeFocus: string;
  setAnalyzeFocus: (next: string) => void;
  inspectResult: UnknownRecord | null;
  setInspectResult: (value: UnknownRecord | null) => void;
  analyzeResult: UnknownRecord | null;
  setAnalyzeResult: (value: UnknownRecord | null) => void;
}) {
  const runInspect = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setInspectError("Path is required.");
      return;
    }
    setInspectBusy(true);
    setInspectError("");
    setInspectResult(null);
    try {
      const payload = await desktopRequest<InspectResponse>(
        `/media/inspect?path=${encodeURIComponent(trimmed)}`,
      );
      setInspectResult((payload.media as UnknownRecord) ?? {});
    } catch (error) {
      setInspectError(errorMessage(error));
    } finally {
      setInspectBusy(false);
    }
  };

  const runAnalyze = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setAnalyzeError("Path is required.");
      return;
    }
    setAnalyzeBusy(true);
    setAnalyzeError("");
    setAnalyzeResult(null);
    try {
      const payload = await desktopRequest<AnalyzeResponse>(
        "/media/analyze",
        "POST",
        {
          path: trimmed,
          focus: analyzeFocus || undefined,
        },
      );
      setAnalyzeResult((payload.analysis as UnknownRecord) ?? {});
    } catch (error) {
      setAnalyzeError(errorMessage(error));
    } finally {
      setAnalyzeBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Inspect and analyze media">
      <form className="content-card media-form" onSubmit={runInspect}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Inspect</span>
            <h2>Read metadata from a local file</h2>
          </div>
        </div>
        <label>
          <span>Local file path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/tmp/example.wav"
            aria-label="Media path for inspection"
          />
          <small>Returned paths are not auto-opened.</small>
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => void chooseLocalMediaFile(setPath, setInspectError)}
            type="button"
          >
            Browse…
          </button>
          <button
            className="primary-button"
            disabled={inspectBusy}
            type="submit"
          >
            {inspectBusy ? "Inspecting…" : "Inspect"}
          </button>
        </div>
      </form>

      {inspectError ? <Notice tone="bad">{inspectError}</Notice> : null}
      {inspectResult ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Inspect result</span>
              <h2>Bounded metadata</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {renderText(inspectResult)}
          </pre>
        </div>
      ) : null}

      <form className="content-card media-form" onSubmit={runAnalyze}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Analyze</span>
            <h2>Run model analysis</h2>
          </div>
        </div>
        <label>
          <span>Focus</span>
          <select
            value={analyzeFocus}
            onChange={(event) => setAnalyzeFocus(event.target.value)}
          >
            <option value="">auto</option>
            <option value="voice">voice</option>
            <option value="vision">vision</option>
            <option value="research">research</option>
          </select>
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={analyzeBusy}
            type="submit"
          >
            {analyzeBusy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </form>

      {analyzeError ? <Notice tone="bad">{analyzeError}</Notice> : null}
      {analyzeResult ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Analysis result</span>
              <h2>Bounded JSON/text</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {renderText(analyzeResult)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function TranscribeTab({
  path,
  setPath,
  busy,
  setBusy,
  error,
  setError,
  language,
  setLanguage,
  name,
  setName,
  prompt,
  setPrompt,
  result,
  setResult,
}: {
  path: string;
  setPath: (next: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  language: string;
  setLanguage: (next: string) => void;
  name: string;
  setName: (next: string) => void;
  prompt: string;
  setPrompt: (next: string) => void;
  result: UnknownRecord | null;
  setResult: (value: UnknownRecord | null) => void;
}) {
  const runTranscribe = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setError("Path is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await desktopRequest<TranscribeResponse>(
        "/media/transcribe",
        "POST",
        {
          path: trimmed,
          language: language || undefined,
          name: name || undefined,
          prompt: prompt || undefined,
        },
      );
      setResult((payload.transcription as UnknownRecord) ?? {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Transcribe media">
      <form className="content-card media-form" onSubmit={runTranscribe}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Transcribe</span>
            <h2>Convert local media to text</h2>
          </div>
        </div>
        <label>
          <span>Audio/video file path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/tmp/meeting.webm"
          />
        </label>
        <label>
          <span>Language</span>
          <input
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="en-US"
          />
        </label>
        <label>
          <span>Source name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="meeting"
          />
        </label>
        <label>
          <span>Prompt</span>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Emphasize action items"
          />
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => void chooseLocalMediaFile(setPath, setError)}
            type="button"
          >
            Browse…
          </button>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Transcribing…" : "Transcribe"}
          </button>
        </div>
      </form>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Transcribe result</span>
              <h2>Bounded output</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {renderText(result)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function SpeechTab({
  text,
  setText,
  name,
  setName,
  voice,
  setVoice,
  format,
  setFormat,
  speed,
  setSpeed,
  busy,
  setBusy,
  error,
  setError,
  result,
  setResult,
}: {
  text: string;
  setText: (next: string) => void;
  name: string;
  setName: (next: string) => void;
  voice: string;
  setVoice: (next: string) => void;
  format: string;
  setFormat: (next: string) => void;
  speed: string;
  setSpeed: (next: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  result: UnknownRecord | null;
  setResult: (value: UnknownRecord | null) => void;
}) {
  const runSpeak = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Text is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await desktopRequest<SpeakResponse>(
        "/media/speak",
        "POST",
        {
          text: trimmed,
          name: name || undefined,
          voice: voice || undefined,
          format: format || "mp3",
          speed: Number.parseFloat(speed) || 1,
        },
      );
      setResult((payload.speech as UnknownRecord) ?? {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Generate speech">
      <form className="content-card media-form" onSubmit={runSpeak}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Speech</span>
            <h2>Generate text-to-speech output</h2>
          </div>
        </div>
        <label>
          <span>Text</span>
          <textarea
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your summary…"
          />
        </label>
        <label>
          <span>Output name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="summary-audio"
          />
        </label>
        <label>
          <span>Voice</span>
          <input
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            placeholder="default"
          />
        </label>
        <label>
          <span>Format</span>
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value="mp3">mp3</option>
            <option value="svg">svg</option>
          </select>
        </label>
        <label>
          <span>Speed</span>
          <input
            value={speed}
            onChange={(event) => setSpeed(event.target.value)}
            type="number"
            min="0.5"
            max="3"
            step="0.1"
          />
        </label>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate speech"}
          </button>
        </div>
      </form>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Speech result</span>
              <h2>Bounded output</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {renderText(result)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function ImageTab({
  prompt,
  setPrompt,
  name,
  setName,
  size,
  setSize,
  style,
  setStyle,
  focus,
  setFocus,
  busy,
  setBusy,
  error,
  setError,
  result,
  setResult,
}: {
  prompt: string;
  setPrompt: (next: string) => void;
  name: string;
  setName: (next: string) => void;
  size: string;
  setSize: (next: string) => void;
  style: string;
  setStyle: (next: string) => void;
  focus: string;
  setFocus: (next: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  result: UnknownRecord | null;
  setResult: (value: UnknownRecord | null) => void;
}) {
  const runGenerate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Prompt is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await desktopRequest<GenerateResponse>(
        "/media/generate",
        "POST",
        {
          prompt: trimmed,
          name: name || undefined,
          size: size || undefined,
          style: style || undefined,
          focus: focus || undefined,
        },
      );
      setResult((payload.generation as UnknownRecord) ?? {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Generate image">
      <form className="content-card media-form" onSubmit={runGenerate}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Image</span>
            <h2>Generate an image from text</h2>
          </div>
        </div>
        <label>
          <span>Prompt</span>
          <textarea
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Design a clean operator dashboard"
          />
        </label>
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="dashboard-art"
          />
        </label>
        <label>
          <span>Size</span>
          <input
            value={size}
            onChange={(event) => setSize(event.target.value)}
            placeholder="1024x1024"
          />
        </label>
        <label>
          <span>Style</span>
          <input
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            placeholder="cinematic"
          />
        </label>
        <label>
          <span>Focus</span>
          <input
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            placeholder="UI layout"
          />
        </label>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Image result</span>
              <h2>Bounded output</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {renderText(result)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

export function MediaPage({ active }: { active: boolean }) {
  const tabs = [
    { id: "inspect-analyze", label: "Inspect / Analyze" },
    { id: "transcribe", label: "Transcribe" },
    { id: "speech", label: "Speech" },
    { id: "image", label: "Image" },
  ] as const;

  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]["id"]>("inspect-analyze");
  const tabRefs = useRef<
    Record<(typeof tabs)[number]["id"], HTMLButtonElement | null>
  >({
    "inspect-analyze": null,
    transcribe: null,
    speech: null,
    image: null,
  });

  const [inspectAnalyzePath, setInspectAnalyzePath] = useState("");
  const [analyzeFocus, setAnalyzeFocus] = useState("");
  const [inspectResult, setInspectResult] = useState<UnknownRecord | null>(
    null,
  );
  const [analyzeResult, setAnalyzeResult] = useState<UnknownRecord | null>(
    null,
  );
  const [inspectBusy, setInspectBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [inspectError, setInspectError] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");

  const [transcribePath, setTranscribePath] = useState("");
  const [transcribeLanguage, setTranscribeLanguage] = useState("");
  const [transcribeName, setTranscribeName] = useState("");
  const [transcribePrompt, setTranscribePrompt] = useState("");
  const [transcribeResult, setTranscribeResult] =
    useState<UnknownRecord | null>(null);
  const [transcribeBusy, setTranscribeBusy] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");

  const [speechText, setSpeechText] = useState("");
  const [speechName, setSpeechName] = useState("");
  const [speechVoice, setSpeechVoice] = useState("");
  const [speechFormat, setSpeechFormat] = useState("mp3");
  const [speechSpeed, setSpeechSpeed] = useState("1");
  const [speechResult, setSpeechResult] = useState<UnknownRecord | null>(null);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechError, setSpeechError] = useState("");

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [imageFocus, setImageFocus] = useState("");
  const [imageResult, setImageResult] = useState<UnknownRecord | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");

  const moveTab = (direction: -1 | 1) => {
    const index = tabs.findIndex((entry) => entry.id === activeTab);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    setActiveTab(next.id);
    requestAnimationFrame(() => {
      tabRefs.current[next.id]?.focus();
    });
  };

  return (
    <div className="page studio-page media-page">
      <PageHeader
        eyebrow="Operator"
        title="Media"
        description="Inspect media files, analyze content, transcribe, synthesize speech, and generate images."
      />

      <div aria-label="Media action tabs" className="media-tabs" role="tablist">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            ref={(node) => {
              tabRefs.current[entry.id] = node;
            }}
            id={`media-tab-${entry.id}`}
            role="tab"
            aria-selected={entry.id === activeTab}
            aria-controls={`media-panel-${entry.id}`}
            className={`text-button ${entry.id === activeTab ? "selected" : ""}`}
            type="button"
            disabled={!active}
            onClick={() => setActiveTab(entry.id)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTab(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTab(1);
              }
            }}
            tabIndex={entry.id === activeTab ? 0 : -1}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <section
        id={`media-panel-${activeTab}`}
        className="media-panel"
        aria-live="polite"
      >
        {activeTab === "inspect-analyze" ? (
          <InspectAnalyzeTab
            path={inspectAnalyzePath}
            setPath={setInspectAnalyzePath}
            inspectBusy={inspectBusy}
            setInspectBusy={setInspectBusy}
            inspectError={inspectError}
            setInspectError={setInspectError}
            analyzeBusy={analyzeBusy}
            setAnalyzeBusy={setAnalyzeBusy}
            analyzeError={analyzeError}
            setAnalyzeError={setAnalyzeError}
            analyzeFocus={analyzeFocus}
            setAnalyzeFocus={setAnalyzeFocus}
            inspectResult={inspectResult}
            setInspectResult={setInspectResult}
            analyzeResult={analyzeResult}
            setAnalyzeResult={setAnalyzeResult}
          />
        ) : activeTab === "transcribe" ? (
          <TranscribeTab
            path={transcribePath}
            setPath={setTranscribePath}
            busy={transcribeBusy}
            setBusy={setTranscribeBusy}
            error={transcribeError}
            setError={setTranscribeError}
            language={transcribeLanguage}
            setLanguage={setTranscribeLanguage}
            name={transcribeName}
            setName={setTranscribeName}
            prompt={transcribePrompt}
            setPrompt={setTranscribePrompt}
            result={transcribeResult}
            setResult={setTranscribeResult}
          />
        ) : activeTab === "speech" ? (
          <SpeechTab
            text={speechText}
            setText={setSpeechText}
            name={speechName}
            setName={setSpeechName}
            voice={speechVoice}
            setVoice={setSpeechVoice}
            format={speechFormat}
            setFormat={setSpeechFormat}
            speed={speechSpeed}
            setSpeed={setSpeechSpeed}
            busy={speechBusy}
            setBusy={setSpeechBusy}
            error={speechError}
            setError={setSpeechError}
            result={speechResult}
            setResult={setSpeechResult}
          />
        ) : (
          <ImageTab
            prompt={imagePrompt}
            setPrompt={setImagePrompt}
            name={imageName}
            setName={setImageName}
            size={imageSize}
            setSize={setImageSize}
            style={imageStyle}
            setStyle={setImageStyle}
            focus={imageFocus}
            setFocus={setImageFocus}
            busy={imageBusy}
            setBusy={setImageBusy}
            error={imageError}
            setError={setImageError}
            result={imageResult}
            setResult={setImageResult}
          />
        )}
      </section>
    </div>
  );
}
