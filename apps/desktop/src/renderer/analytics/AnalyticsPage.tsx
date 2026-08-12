import { CompactStatStrip } from "../components/CompactStatStrip";
import { OfflineRouteState } from "../components/OfflineRouteState";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  compactNumber,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  useApiResource,
} from "../lib";
import { compactSessionPreview } from "../session-preview";
import "../observability.css";

interface AnalyticsResponse {
  totals?: {
    sessions?: number;
    messages?: number;
    estimatedTokens?: number;
    userMessages?: number;
    assistantMessages?: number;
    systemMessages?: number;
  };
  recentSessions?: unknown[];
  dailyActivity?: unknown[];
}

const SESSION_LABEL_LIMIT = 72;

export function analyticsSessionLabel(entry: Record<string, unknown>): string {
  const usage = asRecord(entry.usage);
  const preview = asArray(entry.preview)
    .map((value) => asString(value).trim())
    .find(Boolean);
  const label =
    asString(entry.title).trim() ||
    preview ||
    asString(usage.lastPreview).trim();
  if (!label) return "Untitled session";
  const normalized = compactSessionPreview(
    label.replace(/^\[(?:assistant|system|user)\]\s*/iu, ""),
  );
  return normalized.length > SESSION_LABEL_LIMIT
    ? `${normalized.slice(0, SESSION_LABEL_LIMIT - 1).trimEnd()}…`
    : normalized;
}

export function hasAnalyticsActivity(
  totals: NonNullable<AnalyticsResponse["totals"]>,
  activityCount: number,
  recentSessionCount: number,
): boolean {
  return (
    activityCount > 0 ||
    recentSessionCount > 0 ||
    Object.values(totals).some(
      (value) => typeof value === "number" && value > 0,
    )
  );
}

export function AnalyticsPage({
  active,
  onNewConversation,
}: {
  active: boolean;
  onNewConversation: () => void;
}) {
  const resource = useApiResource<AnalyticsResponse>(
    active ? "/analytics" : null,
    [active],
  );
  const totals = resource.data?.totals ?? {};
  const activity = asArray(resource.data?.dailyActivity).map((value) =>
    asRecord(value),
  );
  const recentSessions = asArray(resource.data?.recentSessions).map((value) =>
    asRecord(value),
  );
  const maxMessages = Math.max(
    1,
    ...activity.map((entry) =>
      asNumber(entry.messages, asNumber(entry.messageCount)),
    ),
  );
  const hasActivity = hasAnalyticsActivity(
    totals,
    activity.length,
    recentSessions.length,
  );

  return (
    <div className="page page-analytics">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Local session and context estimates. No remote telemetry."
        actions={
          <button
            className="secondary-button"
            disabled={!active}
            onClick={resource.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {!active ? (
        <OfflineRouteState>
          Analytics are unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : resource.loading ? (
        <LoadingBlock label="Calculating local activity…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : !hasActivity ? (
        <section
          aria-labelledby="analytics-empty-title"
          className="content-card analytics-empty-landing"
        >
          <div className="analytics-empty-landing__copy">
            <span className="eyebrow">Private by design</span>
            <h2 id="analytics-empty-title">No local activity yet</h2>
            <p>
              Start a conversation. Session counts and context estimates stay on
              this device.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={onNewConversation}
            type="button"
          >
            Start conversation
          </button>
        </section>
      ) : (
        <>
          <CompactStatStrip
            label="Analytics summary"
            stats={[
              {
                label: "Sessions",
                value: compactNumber(totals.sessions ?? 0),
              },
              {
                label: `Messages · ${compactNumber(totals.userMessages ?? 0)} yours`,
                value: compactNumber(totals.messages ?? 0),
              },
              {
                label: "Est. tokens",
                value: compactNumber(totals.estimatedTokens ?? 0),
              },
              {
                label: `Replies · ${compactNumber(totals.systemMessages ?? 0)} system`,
                value: compactNumber(totals.assistantMessages ?? 0),
              },
            ]}
          />
          <div className="analytics-grid">
            <section className="content-card analytics-chart-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Recent activity</span>
                  <h2>Messages by day</h2>
                </div>
              </div>
              {activity.length ? (
                <div
                  aria-label="Messages by day"
                  className="bar-chart"
                  role="img"
                >
                  {activity.map((entry) => {
                    const messages = asNumber(
                      entry.messages,
                      asNumber(entry.messageCount),
                    );
                    const label = asString(
                      entry.date,
                      asString(entry.day, "No date"),
                    );
                    return (
                      <div
                        className="bar-column"
                        key={`${label}:${JSON.stringify(entry)}`}
                      >
                        <span className="bar-value">{messages}</span>
                        <div className="bar-track">
                          <i
                            style={{
                              height: `${Math.max(4, (messages / maxMessages) * 100)}%`,
                            }}
                          />
                        </div>
                        <small>{label.slice(5) || label}</small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBlock density="compact" title="No daily activity yet">
                  Session totals are available, but no daily message series was
                  reported.
                </EmptyBlock>
              )}
            </section>
            <section className="content-card analytics-sessions-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Conversations</span>
                  <h2>Recent sessions</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Messages</th>
                      <th>Est. tokens</th>
                      <th>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.length === 0 ? (
                      <tr>
                        <td className="analytics-empty-cell" colSpan={4}>
                          No session usage yet
                        </td>
                      </tr>
                    ) : null}
                    {recentSessions.map((entry, index) => {
                      const usage = asRecord(entry.usage);
                      return (
                        <tr key={asString(entry.sessionId, String(index))}>
                          <td className="analytics-session-label">
                            {analyticsSessionLabel(entry)}
                          </td>
                          <td>{asNumber(entry.messageCount)}</td>
                          <td>
                            {compactNumber(
                              asNumber(
                                usage.estimatedTokens,
                                asNumber(entry.estimatedTokens),
                              ),
                            )}
                          </td>
                          <td>
                            {displayTimestamp(
                              asString(entry.endedAt) || undefined,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
