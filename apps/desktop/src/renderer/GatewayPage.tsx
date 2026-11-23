import { Button } from "@doolittle/ui";
import { ChevronDown, Route } from "lucide-react";
import { useMemo, useState } from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import { UiIcon } from "./components/UiIcon";
import { GatewayPairingPanel } from "./gateway/GatewayPairingPanel";
import {
  type GatewayTimelineDirection,
  GatewayTimelinePanel,
} from "./gateway/GatewayTimelinePanel";
import { GATEWAY_PAGE_CLASS } from "./gateway/gateway-layout";
import "./gateway/gateway-surface.css";
import "./orchestration/work-surfaces.css";
import {
  approvedPairingSenders,
  buildGatewayTimeline,
  filterGatewayTimeline,
  GATEWAY_HISTORY_LIMIT,
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
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  titleCase,
  useApiResource,
} from "./lib";
import { summarizeResourceStatuses } from "./resource-status";
import {
  WorkMasthead,
  WorkSurface,
  WorkTag,
  WorkToolbar,
} from "./work-surface/WorkSurface";

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

export function gatewayReplayFeedback(payload: unknown): ActionFeedback {
  const result = asRecord(asRecord(payload).result);
  if (result.ok !== true) {
    return gatewayActionFeedback(
      "replay",
      asString(result.deliveryFailure).trim() ||
        asString(result.response).trim() ||
        "The gateway did not report a successful outcome.",
    );
  }
  return {
    message:
      "Replay completed. Review message history for the delivery outcome.",
    tone: "good",
  };
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
    resourcePolicy.primary
      ? `/gateway/inbox?limit=${GATEWAY_HISTORY_LIMIT}`
      : null,
    [resourcePolicy.primary],
  );
  const outbox = useApiResource<GatewayHistoryResponse>(
    resourcePolicy.primary
      ? `/gateway/outbox?limit=${GATEWAY_HISTORY_LIMIT}`
      : null,
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
  const historyError = inbox.error || outbox.error;
  const historyUnavailable = Boolean(historyError && !entries.length);
  const statusResources = [
    { label: "gateway state", resource: state },
    { label: "inbox", resource: inbox },
    { label: "outbox", resource: outbox },
    { label: "thread routes", resource: sessions, required: false },
    { label: "pending pairings", resource: pairingPending, required: false },
    { label: "approved pairings", resource: pairingApproved, required: false },
  ].filter((entry) => entry.resource.status !== "disabled");
  const resourceSummary = summarizeResourceStatuses(statusResources);
  const showResourceStatus =
    resourceSummary.status === "loading" ||
    resourceSummary.status === "refreshing" ||
    resourceSummary.status === "error";

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
      const response = await desktopRequest("/gateway/replay", "POST", {
        recordId,
      });
      setFeedback(gatewayReplayFeedback(response));
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

  const masthead = (
    <WorkMasthead
      actions={
        <Button
          disabled={!active}
          onClick={refresh}
          type="button"
          variant="secondary"
        >
          Refresh records
        </Button>
      }
      kicker="Channels"
      meta={
        active ? (
          <span title={gateway.reason}>
            <strong>{gateway.running ? "Running" : "Stopped"}</strong>
            {" · "}
            {gateway.reason}
          </span>
        ) : undefined
      }
      title="Gateway"
    />
  );

  if (!active) {
    return (
      <WorkSurface className={GATEWAY_PAGE_CLASS}>
        {masthead}
        <OfflineRouteState>
          Gateway history, routes, and sender approvals are unavailable until
          the local runtime is ready.
        </OfflineRouteState>
      </WorkSurface>
    );
  }

  return (
    <WorkSurface className={GATEWAY_PAGE_CLASS}>
      {masthead}

      <WorkToolbar>
        <span className="gateway-connection-summary">
          <strong>{gateway.ready}</strong>/{gateway.configured} adapters ready ·{" "}
          <strong>{gateway.operational}</strong> transports operational ·{" "}
          <strong>{entries.length}</strong> records (
          {asArray(inbox.data?.inbox).length} in ·{" "}
          {asArray(outbox.data?.outbox).length} out) ·{" "}
          {pairingOpen
            ? pairingPending.loading || pairingApproved.loading
              ? "approvals loading…"
              : `${pendingPairings.length} awaiting approval`
            : "approvals on demand"}
        </span>
      </WorkToolbar>

      {showResourceStatus ? (
        <ResourceStatusBar resources={statusResources} />
      ) : null}

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

      <GatewayTimelinePanel
        direction={direction}
        entries={entries}
        historyError={historyError}
        historyUnavailable={historyUnavailable}
        loading={loading}
        onDirectionChange={setDirection}
        onPlatformChange={setPlatform}
        onQueryChange={setQuery}
        onReplay={replay}
        onRetryDelivery={retryDelivery}
        onRetryHistory={refresh}
        platform={platform}
        platforms={platforms}
        query={query}
        replayingId={replayingId}
        retryingDeliveryId={retryingDeliveryId}
        secondary={
          <div className="gateway-detail-secondary">
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
                pairingPending.data?.truncated ||
                  pairingApproved.data?.truncated,
              )}
            />
            <details
              className="work-disclosure"
              onToggle={(event) => setRoutesOpen(event.currentTarget.open)}
              open={routesOpen}
            >
              <summary>
                <span className="work-disclosure__identity">
                  <UiIcon icon={Route} size="md" />
                  <strong>Thread routes</strong>
                </span>
                <span className="work-disclosure__meta">
                  {routesOpen
                    ? sessions.loading
                      ? "Loading…"
                      : `${localSessions.length} routes`
                    : "Load routes"}
                  <UiIcon icon={ChevronDown} />
                </span>
              </summary>
              {routesOpen ? (
                <div className="gateway-disclosure-body">
                  {sessions.loading ? (
                    <LoadingBlock label="Loading gateway routes…" />
                  ) : sessions.error ? (
                    <ErrorBlock
                      error={sessions.error}
                      retry={sessions.reload}
                    />
                  ) : !localSessions.length ? (
                    <EmptyBlock density="compact" title="No local routes yet">
                      Routes appear after Doolittle accepts an inbound gateway
                      message.
                    </EmptyBlock>
                  ) : (
                    <ul className="gateway-route-list">
                      {localSessions.slice(0, 12).map((session) => (
                        <li className="gateway-route" key={session.id}>
                          <WorkTag>{titleCase(session.platform)}</WorkTag>
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
        }
        visibleEntries={visibleEntries}
      />
    </WorkSurface>
  );
}
