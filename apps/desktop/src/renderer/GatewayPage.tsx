import { Button } from "@elizaos/ui/components/ui/button";
import { useMemo, useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import { GatewayPairingPanel } from "./gateway/GatewayPairingPanel";
import {
  type GatewayTimelineDirection,
  GatewayTimelinePanel,
} from "./gateway/GatewayTimelinePanel";
import {
  GATEWAY_DISCLOSURE_SUMMARY_CLASS,
  GATEWAY_LAYOUT_CLASS,
  GATEWAY_LIST_CLASS,
  GATEWAY_META_CLASS,
  GATEWAY_PAGE_CLASS,
  GATEWAY_SECONDARY_GRID_CLASS,
} from "./gateway/gateway-layout";
import {
  approvedPairingSenders,
  buildGatewayTimeline,
  filterGatewayTimeline,
  gatewayActionFeedback,
  gatewayResourcePolicy,
  pairingRequests,
} from "./gateway-page-model";
import {
  type ActionFeedback,
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
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";

interface GatewayStateResponse {
  state?: unknown;
}

interface GatewayHistoryResponse {
  inbox?: unknown[];
  outbox?: unknown[];
}

interface GatewaySessionsResponse {
  sessions?: unknown[];
}

interface PairingPendingResponse {
  requests?: unknown[];
  truncated?: boolean;
}

interface PairingApprovedResponse {
  approved?: unknown[];
  truncated?: boolean;
}

function stateSummary(state: unknown) {
  const record = asRecord(state);
  const totals = asRecord(record.totals);
  const configured = asNumber(totals.configuredPlatforms);
  const operational = asNumber(totals.operationalTransports);
  const ready = asNumber(totals.readyAdapters);
  const running = record.running === true;
  const reason = asString(
    record.reason,
    "No local gateway status was reported.",
  );
  return { configured, operational, ready, running, reason };
}

function sessionMetadata(session: unknown) {
  const record = asRecord(session);
  return {
    id: asString(record.sessionKey, "Unknown session"),
    platform: asString(record.platform, "unknown"),
    room: asString(record.roomId, "No room recorded"),
    thread: asString(record.threadId),
    updatedAt: asString(record.updatedAt),
    agentSession: asString(record.activeAgentSessionId),
  };
}

export function GatewayPage({ active }: { active: boolean }) {
  const [pairingOpen, setPairingOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);
  const resourcePolicy = gatewayResourcePolicy(active, pairingOpen, routesOpen);
  const state = useApiResource<GatewayStateResponse>(
    resourcePolicy.primary ? "/gateway/state" : null,
    [resourcePolicy.primary],
  );
  const inbox = useApiResource<GatewayHistoryResponse>(
    resourcePolicy.primary ? "/gateway/inbox?limit=25" : null,
    [resourcePolicy.primary],
  );
  const outbox = useApiResource<GatewayHistoryResponse>(
    resourcePolicy.primary ? "/gateway/outbox?limit=25" : null,
    [resourcePolicy.primary],
  );
  const sessions = useApiResource<GatewaySessionsResponse>(
    resourcePolicy.routes ? "/sessions/gateway" : null,
    [resourcePolicy.routes],
  );
  const pairingPending = useApiResource<PairingPendingResponse>(
    resourcePolicy.pairing ? "/pairing/pending?limit=200" : null,
    [resourcePolicy.pairing],
  );
  const pairingApproved = useApiResource<PairingApprovedResponse>(
    resourcePolicy.pairing ? "/pairing/approved?limit=200" : null,
    [resourcePolicy.pairing],
  );
  const [direction, setDirection] = useState<GatewayTimelineDirection>("all");
  const [platform, setPlatform] = useState("all");
  const [query, setQuery] = useState("");
  const [replayingId, setReplayingId] = useState("");
  const [retryingDeliveryId, setRetryingDeliveryId] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [pairingAction, setPairingAction] = useState("");
  const [confirmPairingAction, setConfirmPairingAction] = useState("");

  const entries = useMemo(
    () =>
      buildGatewayTimeline(
        asArray(inbox.data?.inbox),
        asArray(outbox.data?.outbox),
      ),
    [inbox.data?.inbox, outbox.data?.outbox],
  );
  const platforms = useMemo(
    () => [...new Set(entries.map((entry) => entry.platform))].sort(),
    [entries],
  );
  const visibleEntries = useMemo(
    () => filterGatewayTimeline(entries, { direction, platform, query }),
    [direction, entries, platform, query],
  );
  const gateway = stateSummary(state.data?.state);
  const localSessions = asArray(sessions.data?.sessions)
    .map(sessionMetadata)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const pendingPairings = useMemo(
    () => pairingRequests(pairingPending.data?.requests),
    [pairingPending.data?.requests],
  );
  const approvedPairings = useMemo(
    () => approvedPairingSenders(pairingApproved.data?.approved),
    [pairingApproved.data?.approved],
  );
  const errors = [state.error, inbox.error, outbox.error].filter(Boolean);
  const loading = state.loading || inbox.loading || outbox.loading;
  const statusResources = [
    { label: "gateway state", resource: state },
    { label: "inbox", resource: inbox },
    { label: "outbox", resource: outbox },
    { label: "thread routes", resource: sessions, required: false },
    { label: "pending pairings", resource: pairingPending, required: false },
    { label: "approved pairings", resource: pairingApproved, required: false },
  ].filter((entry) => entry.resource.status !== "disabled");

  const refresh = () => {
    if (!active) return;
    state.reload();
    inbox.reload();
    outbox.reload();
    if (routesOpen) sessions.reload();
    if (pairingOpen) {
      pairingPending.reload();
      pairingApproved.reload();
    }
  };

  const updatePairing = async (
    action: "approve" | "deny" | "revoke",
    input: { platform: string; code?: string; userId?: string },
  ) => {
    if (!active) return;
    const actionId = `${action}:${input.platform}:${input.code ?? input.userId}`;
    setPairingAction(actionId);
    setFeedback(null);
    try {
      await desktopRequest(`/pairing/${action}`, "POST", input);
      setFeedback(gatewayActionFeedback(action));
      setConfirmPairingAction("");
      refresh();
    } catch (error) {
      setFeedback(gatewayActionFeedback(action, errorMessage(error)));
    } finally {
      setPairingAction("");
    }
  };

  const replay = async (recordId: string) => {
    if (!active) return;
    setReplayingId(recordId);
    setFeedback(null);
    try {
      await desktopRequest("/gateway/replay", "POST", { recordId });
      setFeedback(gatewayActionFeedback("replay"));
      refresh();
    } catch (error) {
      setFeedback(gatewayActionFeedback("replay", errorMessage(error)));
    } finally {
      setReplayingId("");
    }
  };

  const retryDelivery = async (recordId: string) => {
    if (!active) return;
    setRetryingDeliveryId(recordId);
    setFeedback(null);
    try {
      await desktopRequest("/gateway/delivery/retry", "POST", { recordId });
      setFeedback(gatewayActionFeedback("retry-delivery"));
      refresh();
    } catch (error) {
      setFeedback(gatewayActionFeedback("retry-delivery", errorMessage(error)));
    } finally {
      setRetryingDeliveryId("");
    }
  };

  if (!active) {
    return (
      <section className={GATEWAY_PAGE_CLASS}>
        <PageHeader
          eyebrow="Observe / gateway"
          title="Gateway inbox"
          description="Local transport history, thread routes, and sender approvals."
          actions={
            <Button disabled onClick={refresh} type="button">
              Refresh records
            </Button>
          }
        />
        <OfflineRouteState>
          Gateway history, routes, and sender approvals are unavailable until
          the local runtime is ready.
        </OfflineRouteState>
      </section>
    );
  }

  return (
    <section className={GATEWAY_PAGE_CLASS}>
      <PageHeader
        eyebrow="Observe / gateway"
        title="Gateway inbox"
        description="Local transport history, thread routes, and sender approvals."
        actions={
          <Button onClick={refresh} type="button" variant="secondary">
            Refresh records
          </Button>
        }
      />

      <ResourceStatusBar resources={statusResources} />

      {errors.length ? (
        <Notice tone="warn">
          <strong>Some gateway data is unavailable.</strong>
          <span>{errors[0]}</span>
          <Button onClick={refresh} size="sm" type="button" variant="ghost">
            Retry local reads
          </Button>
        </Notice>
      ) : null}
      {feedback ? (
        <Notice announce="status" tone={feedback.tone}>
          {feedback.message}
        </Notice>
      ) : null}

      <CompactStatStrip
        label="Gateway summary"
        stats={[
          {
            detail: gateway.reason,
            label: "Gateway",
            tone: gateway.running ? "good" : "warn",
            value: gateway.running ? "Running" : "Stopped",
          },
          {
            detail: `${gateway.operational} operational of ${gateway.configured}`,
            label: "Transports",
            tone: gateway.ready ? "good" : "warn",
            value: `${gateway.ready} ready`,
          },
          {
            detail: `${asArray(inbox.data?.inbox).length} inbox · ${asArray(outbox.data?.outbox).length} outbox`,
            label: "Messages",
            value: entries.length,
          },
          {
            detail:
              pairingOpen && (pairingPending.loading || pairingApproved.loading)
                ? "Loading approvals"
                : pairingOpen
                  ? "Awaiting approval"
                  : "Open sender approvals",
            label: "Pairing",
            tone: pairingOpen && pendingPairings.length ? "warn" : "neutral",
            value:
              pairingOpen && (pairingPending.loading || pairingApproved.loading)
                ? "…"
                : pairingOpen
                  ? pendingPairings.length
                  : "On demand",
          },
        ]}
      />

      <div className={GATEWAY_LAYOUT_CLASS}>
        <GatewayTimelinePanel
          direction={direction}
          entries={entries}
          loading={loading}
          onDirectionChange={setDirection}
          onPlatformChange={setPlatform}
          onQueryChange={setQuery}
          onReplay={replay}
          onRetryDelivery={retryDelivery}
          platform={platform}
          platforms={platforms}
          query={query}
          replayingId={replayingId}
          retryingDeliveryId={retryingDeliveryId}
          visibleEntries={visibleEntries}
        />

        <div className={GATEWAY_SECONDARY_GRID_CLASS}>
          <details
            className="group panel min-w-0 overflow-hidden p-0"
            onToggle={(event) => setRoutesOpen(event.currentTarget.open)}
            open={routesOpen}
          >
            <summary className={GATEWAY_DISCLOSURE_SUMMARY_CLASS}>
              <span className="flex flex-col gap-0.5">
                <strong>Thread routes</strong>
                <small className={GATEWAY_META_CLASS}>
                  Room and attached-agent routes
                </small>
              </span>
              <span
                className={`${GATEWAY_META_CLASS} after:absolute after:right-3 after:font-mono after:text-[var(--accent)] after:content-['+'] group-open:after:content-['−']`}
              >
                {routesOpen
                  ? sessions.loading
                    ? "Loading…"
                    : `${localSessions.length} routes`
                  : "Load routes"}
              </span>
            </summary>
            {routesOpen ? (
              <div className="border-[var(--border)] border-t px-3 pb-3">
                {sessions.loading ? (
                  <LoadingBlock label="Loading gateway routes…" />
                ) : sessions.error ? (
                  <ErrorBlock error={sessions.error} retry={sessions.reload} />
                ) : !localSessions.length ? (
                  <EmptyBlock density="compact" title="No local routes yet">
                    Routes appear after Doolittle accepts an inbound gateway
                    message.
                  </EmptyBlock>
                ) : (
                  <ul className={GATEWAY_LIST_CLASS}>
                    {localSessions.slice(0, 12).map((session) => (
                      <li
                        className="grid gap-1.25 border-[var(--border)] border-b py-2.25 last:border-b-0 [&_small]:font-mono [&_small]:text-[10px] [&_small]:text-[var(--muted)] [&_span]:font-mono [&_span]:text-[10px] [&_span]:text-[var(--muted)] [&_time]:font-mono [&_time]:text-[10px] [&_time]:text-[var(--muted)]"
                        key={session.id}
                      >
                        <Badge>{titleCase(session.platform)}</Badge>
                        <strong className="truncate">{session.room}</strong>
                        <span>
                          {session.thread
                            ? `Thread ${session.thread}`
                            : "Root route"}
                        </span>
                        <small>
                          {session.agentSession
                            ? `Agent: ${session.agentSession}`
                            : "Agent session not recorded"}
                        </small>
                        <time dateTime={session.updatedAt}>
                          {displayTimestamp(session.updatedAt)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </details>

          <GatewayPairingPanel
            actionId={pairingAction}
            approved={approvedPairings}
            confirmationId={confirmPairingAction}
            error={pairingPending.error || pairingApproved.error}
            loading={pairingPending.loading || pairingApproved.loading}
            onConfirmationChange={setConfirmPairingAction}
            onOpenChange={setPairingOpen}
            onRetry={() => {
              pairingPending.reload();
              pairingApproved.reload();
            }}
            onUpdate={(action, input) => void updatePairing(action, input)}
            open={pairingOpen}
            pending={pendingPairings}
            truncated={Boolean(
              pairingPending.data?.truncated || pairingApproved.data?.truncated,
            )}
          />
        </div>
      </div>
    </section>
  );
}
