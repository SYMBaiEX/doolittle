import { Button } from "@doolittle/ui";
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
import {
  OBSERVABILITY_CARD_CLASS,
  OBSERVABILITY_CARD_HEADING_CLASS,
  OBSERVABILITY_EYEBROW_CLASS,
  OBSERVABILITY_PAGE_CLASS,
} from "../observability-layout";
import { compactSessionPreview } from "../session-preview";
import "./analytics-workbench.css";

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
  const activity = asArray(resource.data?.dailyActivity).flatMap((value) => {
    const entry = asRecord(value);
    const date = asString(entry.date, asString(entry.day));
    const messages = Math.max(
      0,
      asNumber(entry.messages, asNumber(entry.messageCount)),
    );
    return date ? [{ date, messages }] : [];
  });
  const recentSessions = asArray(resource.data?.recentSessions).map((value) =>
    asRecord(value),
  );
  const maxMessages = activity.reduce(
    (largest, entry) => Math.max(largest, entry.messages),
    1,
  );
  const hasActivity = hasAnalyticsActivity(
    totals,
    activity.length,
    recentSessions.length,
  );

  return (
    <div className={OBSERVABILITY_PAGE_CLASS} data-analytics-page="true">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Local conversation activity and context estimates."
        actions={
          <Button
            disabled={!active}
            onClick={resource.reload}
            type="button"
            variant="outline"
          >
            Refresh
          </Button>
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
          className={`analytics-empty-landing ${OBSERVABILITY_CARD_CLASS}`}
          data-analytics-empty="true"
        >
          <div className="grid min-w-0 gap-[3px]">
            <h2
              className="text-sm font-bold text-[var(--text-strong)]"
              id="analytics-empty-title"
            >
              No local activity yet
            </h2>
            <p className="text-[length:var(--text-control)] text-[var(--text-muted)]">
              Start a conversation to see its activity here.
            </p>
          </div>
          <Button
            className="shrink-0 max-[700px]:w-fit"
            onClick={onNewConversation}
            type="button"
          >
            Start conversation
          </Button>
        </section>
      ) : (
        <div className="analytics-workbench">
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
          <div className="analytics-grid" data-analytics-grid="true">
            <section className={OBSERVABILITY_CARD_CLASS}>
              <div className={OBSERVABILITY_CARD_HEADING_CLASS}>
                <div>
                  <span className={OBSERVABILITY_EYEBROW_CLASS}>
                    Recent activity
                  </span>
                  <h2>Messages by day</h2>
                </div>
              </div>
              {activity.length ? (
                <section
                  aria-label="Daily message counts"
                  className="analytics-series-scroll"
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: This horizontally scrollable series has no nested focusable controls.
                  tabIndex={0}
                >
                  <ul className="analytics-series">
                    {activity.map(({ date, messages }) => (
                      <li key={date}>
                        <span>
                          {messages}{" "}
                          <span className="sr-only">messages on</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="analytics-series-track"
                        >
                          <i
                            style={{
                              height: `${(messages / maxMessages) * 100}%`,
                            }}
                          />
                        </span>
                        <small title={date}>
                          <span className="sr-only">{date}</span>
                          <span aria-hidden="true">
                            {date.replace(/^\d{4}-/u, "")}
                          </span>
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <EmptyBlock density="compact" title="No daily activity yet">
                  Session totals are available, but no daily message series was
                  reported.
                </EmptyBlock>
              )}
            </section>
            <section className={OBSERVABILITY_CARD_CLASS}>
              <div className={OBSERVABILITY_CARD_HEADING_CLASS}>
                <div>
                  <span className={OBSERVABILITY_EYEBROW_CLASS}>
                    Conversations
                  </span>
                  <h2>Recent sessions</h2>
                </div>
              </div>
              <section
                aria-label="Session usage table"
                className="analytics-session-scroll"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: This scrollable table has no nested focusable controls.
                tabIndex={0}
              >
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {[
                        "Session",
                        "Messages",
                        "Est. tokens",
                        "Last activity",
                      ].map((label) => (
                        <th
                          className="border-b border-[var(--border)] px-[9px] py-[7px] text-left text-[length:var(--text-meta)] uppercase tracking-[0.1em] text-[var(--muted)]"
                          key={label}
                          scope="col"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.length === 0 ? (
                      <tr>
                        <td
                          className="h-[58px] border-b border-[var(--border)] px-[9px] py-[7px] text-center text-[length:var(--text-meta)] text-[var(--muted)]"
                          colSpan={4}
                        >
                          No session usage yet
                        </td>
                      </tr>
                    ) : null}
                    {recentSessions.map((entry, index) => {
                      const usage = asRecord(entry.usage);
                      const label = analyticsSessionLabel(entry);
                      return (
                        <tr key={asString(entry.sessionId, String(index))}>
                          <td
                            className="max-w-[30rem] overflow-hidden text-ellipsis whitespace-nowrap border-b border-[var(--border)] px-[9px] py-[7px] text-[length:var(--text-meta)] text-[var(--text-soft)]"
                            title={label}
                          >
                            {label}
                          </td>
                          <td className="border-b border-[var(--border)] px-[9px] py-[7px] text-[length:var(--text-meta)] text-[var(--text-soft)]">
                            {asNumber(entry.messageCount)}
                          </td>
                          <td className="border-b border-[var(--border)] px-[9px] py-[7px] text-[length:var(--text-meta)] text-[var(--text-soft)]">
                            {compactNumber(
                              asNumber(
                                usage.estimatedTokens,
                                asNumber(entry.estimatedTokens),
                              ),
                            )}
                          </td>
                          <td className="border-b border-[var(--border)] px-[9px] py-[7px] text-[length:var(--text-meta)] text-[var(--text-soft)]">
                            {displayTimestamp(
                              asString(entry.endedAt) || undefined,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
