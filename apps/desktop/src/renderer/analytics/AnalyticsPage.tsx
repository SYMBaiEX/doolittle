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
    <div className={OBSERVABILITY_PAGE_CLASS} data-analytics-page="true">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Local session and context estimates. No remote telemetry."
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
          className={`analytics-empty-landing ${OBSERVABILITY_CARD_CLASS} flex items-center justify-between gap-6 bg-[linear-gradient(105deg,color-mix(in_srgb,var(--accent)_6%,transparent),transparent_42%)] px-5 py-[18px] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-3.5`}
          data-analytics-empty="true"
        >
          <div className="grid min-w-0 gap-[3px]">
            <span className={OBSERVABILITY_EYEBROW_CLASS}>
              Private by design
            </span>
            <h2
              className="text-[17px] font-bold text-[var(--text-strong)]"
              id="analytics-empty-title"
            >
              No local activity yet
            </h2>
            <p className="text-[var(--text-control)] text-[var(--text-muted)]">
              Start a conversation. Session counts and context estimates stay on
              this device.
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
          <div
            className="analytics-grid grid grid-cols-[minmax(250px,0.62fr)_minmax(32rem,1.38fr)] items-start gap-[9px] max-[1120px]:grid-cols-1"
            data-analytics-grid="true"
          >
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
                <div
                  aria-label="Messages by day"
                  className="flex min-h-[170px] items-end gap-2 px-2.5 pt-2 pb-2.5 max-[1120px]:min-h-[150px]"
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
                        className="flex min-w-5 flex-1 flex-col items-center gap-[5px]"
                        key={`${label}:${JSON.stringify(entry)}`}
                      >
                        <span className="text-[var(--text-meta)] text-[var(--muted)]">
                          {messages}
                        </span>
                        <div className="relative h-[108px] w-full max-w-8 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-soft)] max-[1120px]:h-[92px]">
                          <i
                            className="absolute inset-x-0 bottom-0 rounded-t-[2px] bg-[var(--accent)]"
                            style={{
                              height: `${Math.max(4, (messages / maxMessages) * 100)}%`,
                            }}
                          />
                        </div>
                        <small className="text-[var(--text-meta)] text-[var(--muted)]">
                          {label.slice(5) || label}
                        </small>
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
            <section className={OBSERVABILITY_CARD_CLASS}>
              <div className={OBSERVABILITY_CARD_HEADING_CLASS}>
                <div>
                  <span className={OBSERVABILITY_EYEBROW_CLASS}>
                    Conversations
                  </span>
                  <h2>Recent sessions</h2>
                </div>
              </div>
              <div className="max-h-[236px] overflow-auto">
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
                          className="border-b border-[var(--border)] px-[9px] py-[7px] text-left text-[var(--text-meta)] uppercase tracking-[0.1em] text-[var(--muted)]"
                          key={label}
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
                          className="h-[58px] border-b border-[var(--border)] px-[9px] py-[7px] text-center text-[var(--text-meta)] text-[var(--muted)]"
                          colSpan={4}
                        >
                          No session usage yet
                        </td>
                      </tr>
                    ) : null}
                    {recentSessions.map((entry, index) => {
                      const usage = asRecord(entry.usage);
                      return (
                        <tr key={asString(entry.sessionId, String(index))}>
                          <td className="max-w-[30rem] overflow-hidden text-ellipsis whitespace-nowrap border-b border-[var(--border)] px-[9px] py-[7px] text-[var(--text-meta)] text-[var(--text-soft)]">
                            {analyticsSessionLabel(entry)}
                          </td>
                          <td className="border-b border-[var(--border)] px-[9px] py-[7px] text-[var(--text-meta)] text-[var(--text-soft)]">
                            {asNumber(entry.messageCount)}
                          </td>
                          <td className="border-b border-[var(--border)] px-[9px] py-[7px] text-[var(--text-meta)] text-[var(--text-soft)]">
                            {compactNumber(
                              asNumber(
                                usage.estimatedTokens,
                                asNumber(entry.estimatedTokens),
                              ),
                            )}
                          </td>
                          <td className="border-b border-[var(--border)] px-[9px] py-[7px] text-[var(--text-meta)] text-[var(--text-soft)]">
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

import { Button } from "@elizaos/ui/components/ui/button";
