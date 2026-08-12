import { useMemo, useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { GatewayPairingPanel } from "./gateway/GatewayPairingPanel";
import {
  type GatewayTimelineDirection,
  GatewayTimelinePanel,
} from "./gateway/GatewayTimelinePanel";
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
import "./gateway-page.css";

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

  const refresh = () => {
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

  return (
    <section className="page gateway-page">
      <PageHeader
        eyebrow="Observe / gateway"
        title="Gateway inbox"
        description="Local transport history, thread routes, and sender approvals."
        actions={
          <button className="secondary-button" onClick={refresh} type="button">
            Refresh records
          </button>
        }
      />

      {!active ? (
        <Notice tone="warn">
          <strong>Local runtime unavailable.</strong>
          <span>
            Start or reconnect the runtime to inspect recorded gateway traffic.
          </span>
        </Notice>
      ) : null}
      {errors.length ? (
        <Notice tone="warn">
          <strong>Some gateway data is unavailable.</strong>
          <span>{errors[0]}</span>
          <button className="text-button" onClick={refresh} type="button">
            Retry local reads
          </button>
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
                  : "Open to load",
            label: "Pairing",
            tone: pairingOpen && pendingPairings.length ? "warn" : "neutral",
            value:
              pairingOpen && (pairingPending.loading || pairingApproved.loading)
                ? "…"
                : pairingOpen
                  ? pendingPairings.length
                  : "—",
          },
        ]}
      />

      <div className="gateway-layout">
        <GatewayTimelinePanel
          direction={direction}
          entries={entries}
          loading={loading}
          onDirectionChange={setDirection}
          onPlatformChange={setPlatform}
          onQueryChange={setQuery}
          onReplay={replay}
          platform={platform}
          platforms={platforms}
          query={query}
          replayingId={replayingId}
          visibleEntries={visibleEntries}
        />

        <details
          className="panel gateway-session-panel"
          onToggle={(event) => setRoutesOpen(event.currentTarget.open)}
          open={routesOpen}
        >
          <summary>
            <span>
              <strong>Thread routes</strong>
              <small>Gateway rooms, threads, and attached agent sessions</small>
            </span>
            <span>
              {routesOpen
                ? sessions.loading
                  ? "Loading…"
                  : `${localSessions.length} routes`
                : "Open to load"}
            </span>
          </summary>
          {routesOpen ? (
            <div className="gateway-session-body">
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
                <ul className="gateway-sessions">
                  {localSessions.slice(0, 12).map((session) => (
                    <li key={session.id}>
                      <Badge>{titleCase(session.platform)}</Badge>
                      <strong>{session.room}</strong>
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
      </div>

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
    </section>
  );
}
