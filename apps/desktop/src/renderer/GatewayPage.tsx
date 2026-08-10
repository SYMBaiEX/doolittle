import { useMemo, useState } from "react";
import { InlineActionConfirmation } from "./components/InlineActionConfirmation";
import {
  approvedPairingSenders,
  buildGatewayTimeline,
  filterGatewayTimeline,
  gatewayActionFeedback,
  gatewayStatusTone,
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
  LoadingBlock,
  MetricCard,
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

type TimelineDirection = "all" | "inbox" | "outbox";

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
  const [direction, setDirection] = useState<TimelineDirection>("all");
  const [platform, setPlatform] = useState("all");
  const [query, setQuery] = useState("");
  const [replayingId, setReplayingId] = useState("");
  const [confirmReplayId, setConfirmReplayId] = useState("");
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
    setConfirmReplayId("");
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
        description="Inspect recorded local transport activity. The page is read-only except for explicit inbound replay, which can trigger a new external reply on the original thread route."
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

      <div className="metric-grid gateway-metrics">
        <MetricCard
          label="Gateway state"
          value={gateway.running ? "Running locally" : "Not running"}
          detail={gateway.reason}
        />
        <MetricCard
          label="Transport readiness"
          value={`${gateway.ready} ready`}
          detail={`${gateway.operational} operational of ${gateway.configured} configured`}
        />
        <MetricCard
          label="Recorded messages"
          value={entries.length}
          detail={`${asArray(inbox.data?.inbox).length} inbox · ${asArray(outbox.data?.outbox).length} outbox`}
        />
        <MetricCard
          label="Thread routes"
          value={localSessions.length}
          detail="Local session route records"
        />
        <MetricCard
          label="Pairing requests"
          value={pendingPairings.length}
          detail="Awaiting local operator approval"
        />
      </div>

      <div className="gateway-layout">
        <section
          className="panel gateway-timeline-panel"
          aria-labelledby="gateway-timeline-title"
        >
          <div className="panel-heading gateway-heading">
            <div>
              <span className="eyebrow">Recorded timeline</span>
              <h2 id="gateway-timeline-title">Inbound and outbound history</h2>
            </div>
            <span className="muted-copy">
              Newest first · local journal only
            </span>
          </div>
          <fieldset className="gateway-filters">
            <legend className="sr-only">Gateway record filters</legend>
            <label>
              Direction
              <select
                onChange={(event) =>
                  setDirection(event.target.value as TimelineDirection)
                }
                value={direction}
              >
                <option value="all">All directions</option>
                <option value="inbox">Inbox only</option>
                <option value="outbox">Outbox only</option>
              </select>
            </label>
            <label>
              Platform
              <select
                onChange={(event) => setPlatform(event.target.value)}
                value={platform}
              >
                <option value="all">All platforms</option>
                {platforms.map((entry) => (
                  <option key={entry} value={entry}>
                    {titleCase(entry)}
                  </option>
                ))}
              </select>
            </label>
            <label className="gateway-search">
              Find record
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Message, room, thread, or route"
                type="search"
                value={query}
              />
            </label>
          </fieldset>

          {loading && !entries.length ? (
            <LoadingBlock label="Reading local gateway records…" />
          ) : null}
          {!loading && !entries.length ? (
            <EmptyBlock title="No gateway messages recorded yet">
              No inbound or outbound messages are available in the local
              journal. Configure a transport and wait for real traffic; this
              page does not create test sends.
            </EmptyBlock>
          ) : null}
          {entries.length > 0 && !visibleEntries.length ? (
            <EmptyBlock title="No records match these filters">
              Adjust the direction, platform, or text filter to see recorded
              traffic.
            </EmptyBlock>
          ) : null}
          <ol className="gateway-timeline">
            {visibleEntries.map((entry) => (
              <li
                className={`gateway-entry ${entry.direction}`}
                key={`${entry.direction}:${entry.id}`}
              >
                <div className="gateway-entry-meta">
                  <Badge
                    tone={entry.direction === "inbox" ? "warn" : "neutral"}
                  >
                    {entry.direction === "inbox" ? "Inbound" : "Outbound"}
                  </Badge>
                  <Badge tone={gatewayStatusTone(entry.status)}>
                    {titleCase(entry.status)}
                  </Badge>
                  <span>{titleCase(entry.platform)}</span>
                  <time dateTime={entry.at}>{displayTimestamp(entry.at)}</time>
                </div>
                <p>{entry.preview}</p>
                <div className="gateway-entry-details">
                  <span>Route: {entry.sessionId || "Not recorded"}</span>
                  <span>Room: {entry.roomId || "Not recorded"}</span>
                  {entry.threadId ? (
                    <span>Thread: {entry.threadId}</span>
                  ) : null}
                  {entry.author ? <span>From: {entry.author}</span> : null}
                  {entry.attachmentCount ? (
                    <span>
                      {entry.attachmentCount} attachment
                      {entry.attachmentCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {entry.direction === "inbox" ? (
                  <div className="gateway-replay-row">
                    <span>
                      Reprocesses this recorded inbound preview on its original
                      thread route and may produce a new external reply.
                    </span>
                    <div className="gateway-replay-actions">
                      {confirmReplayId === entry.id ? (
                        <button
                          className="text-button"
                          disabled={Boolean(replayingId)}
                          onClick={() => setConfirmReplayId("")}
                          type="button"
                        >
                          Cancel
                        </button>
                      ) : null}
                      <button
                        className={
                          confirmReplayId === entry.id
                            ? "primary-button"
                            : "secondary-button"
                        }
                        disabled={Boolean(replayingId)}
                        onClick={() => {
                          if (confirmReplayId === entry.id) {
                            void replay(entry.id);
                            return;
                          }
                          setConfirmReplayId(entry.id);
                        }}
                        type="button"
                      >
                        {replayingId === entry.id
                          ? "Replaying…"
                          : confirmReplayId === entry.id
                            ? "Confirm replay"
                            : "Replay inbound"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

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

      <section className="panel pairing-panel" aria-labelledby="pairing-title">
        <div className="panel-heading gateway-heading">
          <div>
            <span className="eyebrow">Secure device access</span>
            <h2 id="pairing-title">Paired sender approvals</h2>
          </div>
          <span className="muted-copy">
            Eliza PairingService · local control
          </span>
        </div>
        <Notice announce="off" tone="neutral">
          <span>
            This approves messaging-platform senders, not remote desktop access.
            Pending requests expire under the Eliza runtime policy; the public
            service does not expose a per-request expiry timestamp.
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
                New sender requests will appear here after Eliza receives them.
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
                          onConfirm={() => void updatePairing("deny", request)}
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
                          onConfirm={() => void updatePairing("revoke", sender)}
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
      </section>
    </section>
  );
}
