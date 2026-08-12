import { CompactStatStrip } from "../components/CompactStatStrip";
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

export function AnalyticsPage({ active }: { active: boolean }) {
  const resource = useApiResource<AnalyticsResponse>(
    active ? "/analytics" : null,
    [active],
  );
  const totals = resource.data?.totals ?? {};
  const activity = asArray(resource.data?.dailyActivity).map((value) =>
    asRecord(value),
  );
  const maxMessages = Math.max(
    1,
    ...activity.map((entry) =>
      asNumber(entry.messages, asNumber(entry.messageCount)),
    ),
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Real local session activity and estimated context usage—no remote telemetry."
        actions={
          <button
            className="secondary-button"
            onClick={resource.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {resource.loading ? (
        <LoadingBlock label="Calculating local activity…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : (
        <>
          <CompactStatStrip
            label="Analytics summary"
            stats={[
              {
                detail: "Persisted locally",
                label: "Sessions",
                value: compactNumber(totals.sessions ?? 0),
              },
              {
                detail: `${compactNumber(totals.userMessages ?? 0)} from you`,
                label: "Messages",
                value: compactNumber(totals.messages ?? 0),
              },
              {
                detail: "Character-based estimate",
                label: "Estimated tokens",
                value: compactNumber(totals.estimatedTokens ?? 0),
              },
              {
                detail: `${compactNumber(totals.systemMessages ?? 0)} system events`,
                label: "Assistant replies",
                value: compactNumber(totals.assistantMessages ?? 0),
              },
            ]}
          />
          <section className="content-card">
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
              <EmptyBlock title="No activity yet">
                Start chatting with Doolittle and activity will accumulate here.
              </EmptyBlock>
            )}
          </section>
          <section className="content-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Conversations</span>
                <h2>Recent session usage</h2>
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
                  {asArray(resource.data?.recentSessions).map(
                    (value, index) => {
                      const entry = asRecord(value);
                      return (
                        <tr key={asString(entry.sessionId, String(index))}>
                          <td>
                            {asString(
                              entry.title,
                              asString(entry.sessionId, "Untitled"),
                            )}
                          </td>
                          <td>{asNumber(entry.messageCount)}</td>
                          <td>
                            {compactNumber(asNumber(entry.estimatedTokens))}
                          </td>
                          <td>
                            {displayTimestamp(
                              asString(entry.endedAt) || undefined,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
