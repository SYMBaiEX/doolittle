import { useMemo, useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { InlineActionConfirmation } from "./components/InlineActionConfirmation";
import {
  type GatewayTimelineDirection,
  GatewayTimelinePanel,
} from "./gateway/GatewayTimelinePanel";
import {
  approvedPairingSenders,
  buildGatewayTimeline,
  filterGatewayTimeline,
  gatewayActionFeedback,
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
  errorMessage,
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
  const state = useApiResource<GatewayStateResponse>(
    active ? "/gateway/state" : null,
    [active],
  );
  const inbox = useApiResource<GatewayHistoryResponse>(
    active ? "/gateway/inbox?limit=25" : null,
    [active],
  );
  const outbox = useApiResource<GatewayHistoryResponse>(
    active ? "/gateway/outbox?limit=25" : null,
    [active],
  );
  const sessions = useApiResource<GatewaySessionsResponse>(
    active ? "/sessions/gateway" : null,
    [active],
  );
  const pairingPending = useApiResource<PairingPendingResponse>(
    active ? "/pairing/pending?limit=200" : null,
    [active],
  );
  const pairingApproved = useApiResource<PairingApprovedResponse>(
    active ? "/pairing/approved?limit=200" : null,
    [active],
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
  const errors = [
    state.error,
    inbox.error,
    outbox.error,
    sessions.error,
    pairingPending.error,
    pairingApproved.error,
  ].filter(Boolean);
  const loading =
    state.loading ||
    inbox.loading ||
    outbox.loading ||
    sessions.loading ||
    pairingPending.loading ||
    pairingApproved.loading;

  const refresh = () => {
    state.reload();
    inbox.reload();
    outbox.reload();
    sessions.reload();
    pairingPending.reload();
    pairingApproved.reload();
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
            detail: "Awaiting approval",
            label: "Pairing",
            tone: pendingPairings.length ? "warn" : "neutral",
            value: pendingPairings.length,
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

        <aside
          className="panel gateway-session-panel"
          aria-labelledby="gateway-sessions-title"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Thread routes</span>
              <h2 id="gateway-sessions-title">Gateway sessions</h2>
            </div>
          </div>
          {!localSessions.length ? (
            <EmptyBlock title="No local routes yet">
              Routes appear after Doolittle accepts an inbound gateway message.
            </EmptyBlock>
          ) : (
            <ul className="gateway-sessions">
              {localSessions.slice(0, 12).map((session) => (
                <li key={session.id}>
                  <Badge>{titleCase(session.platform)}</Badge>
                  <strong>{session.room}</strong>
                  <span>
                    {session.thread ? `Thread ${session.thread}` : "Root route"}
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
        </aside>
      </div>

      <details className="panel pairing-panel" aria-labelledby="pairing-title">
        <summary className="panel-heading gateway-heading">
          <div>
            <span className="eyebrow">Secure device access</span>
            <h2 id="pairing-title">Paired sender approvals</h2>
          </div>
          <span className="pairing-summary-counts">
            {pendingPairings.length} pending · {approvedPairings.length}{" "}
            approved
          </span>
        </summary>
        <div className="pairing-panel-body">
          <Notice announce="off" tone="neutral">
            <span>
              Messaging senders only—not remote desktop access. Requests expire
              under the Eliza runtime policy.
            </span>
          </Notice>
          {pairingPending.data?.truncated || pairingApproved.data?.truncated ? (
            <Notice announce="off" tone="warn">
              Showing the newest 200 pairing records. Filter by platform through
              the API to inspect a narrower allowlist safely.
            </Notice>
          ) : null}
          <div className="pairing-columns">
            <section aria-labelledby="pairing-pending-title">
              <div className="pairing-section-heading">
                <div>
                  <span className="eyebrow">Pending</span>
                  <h3 id="pairing-pending-title">Awaiting approval</h3>
                </div>
                <Badge tone={pendingPairings.length ? "warn" : "neutral"}>
                  {pendingPairings.length}
                </Badge>
              </div>
              {!pendingPairings.length ? (
                <EmptyBlock title="No pending pairing requests">
                  New sender requests will appear here after Eliza receives
                  them.
                </EmptyBlock>
              ) : (
                <ul className="pairing-list">
                  {pendingPairings.map((request) => {
                    const approveId = `approve:${request.platform}:${request.code}`;
                    const denyId = `deny:${request.platform}:${request.code}`;
                    const confirmationId = confirmPairingAction;
                    const actionId = pairingAction;
                    return (
                      <li key={request.id}>
                        <Badge tone="warn">{titleCase(request.platform)}</Badge>
                        <strong>{request.userId}</strong>
                        <span>Code: {request.code}</span>
                        <time dateTime={request.createdAt}>
                          Requested {displayTimestamp(request.createdAt)}
                        </time>
                        {confirmationId === approveId ? (
                          <InlineActionConfirmation
                            busy={actionId === approveId}
                            busyLabel="Approving…"
                            confirmLabel="Confirm approve"
                            detail={`Allows future ${request.platform} messages from this sender.`}
                            onCancel={() => setConfirmPairingAction("")}
                            onConfirm={() =>
                              void updatePairing("approve", request)
                            }
                            title={`Approve ${request.userId}?`}
                            tone="primary"
                          />
                        ) : confirmationId === denyId ? (
                          <InlineActionConfirmation
                            busy={actionId === denyId}
                            busyLabel="Denying…"
                            confirmLabel="Confirm deny"
                            detail="Removes this request without adding the sender to Eliza’s allowlist."
                            onCancel={() => setConfirmPairingAction("")}
                            onConfirm={() =>
                              void updatePairing("deny", request)
                            }
                            title={`Deny ${request.userId}?`}
                          />
                        ) : (
                          <div className="pairing-actions">
                            <button
                              className="secondary-button"
                              disabled={Boolean(actionId)}
                              onClick={() => setConfirmPairingAction(approveId)}
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              className="secondary-button"
                              disabled={Boolean(actionId)}
                              onClick={() => setConfirmPairingAction(denyId)}
                              type="button"
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="pairing-approved-title">
              <div className="pairing-section-heading">
                <div>
                  <span className="eyebrow">Approved</span>
                  <h3 id="pairing-approved-title">Current allowlist</h3>
                </div>
                <Badge tone="good">{approvedPairings.length}</Badge>
              </div>
              {!approvedPairings.length ? (
                <EmptyBlock title="No approved senders">
                  Approvals remain in Eliza’s own allowlist and appear here when
                  the service exposes them.
                </EmptyBlock>
              ) : (
                <ul className="pairing-list">
                  {approvedPairings.map((sender) => {
                    const revokeId = `revoke:${sender.platform}:${sender.userId}`;
                    return (
                      <li key={sender.id}>
                        <Badge tone="good">{titleCase(sender.platform)}</Badge>
                        <strong>{sender.userId}</strong>
                        <time dateTime={sender.approvedAt}>
                          Approved {displayTimestamp(sender.approvedAt)}
                        </time>
                        {confirmPairingAction === revokeId ? (
                          <InlineActionConfirmation
                            busy={pairingAction === revokeId}
                            busyLabel="Revoking…"
                            confirmLabel="Confirm revoke"
                            detail={`Blocks future ${sender.platform} messages until this sender pairs again.`}
                            onCancel={() => setConfirmPairingAction("")}
                            onConfirm={() =>
                              void updatePairing("revoke", sender)
                            }
                            title={`Revoke ${sender.userId}?`}
                          />
                        ) : (
                          <div className="pairing-actions">
                            <button
                              className="secondary-button"
                              disabled={Boolean(pairingAction)}
                              onClick={() => setConfirmPairingAction(revokeId)}
                              type="button"
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </details>
    </section>
  );
}
