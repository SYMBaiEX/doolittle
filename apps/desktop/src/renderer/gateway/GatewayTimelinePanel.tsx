import { useState } from "react";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import {
  type GatewayTimelineItem,
  gatewayStatusTone,
} from "../gateway-page-model";
import { Badge, displayTimestamp, EmptyBlock, titleCase } from "../lib";

export type GatewayTimelineDirection = "all" | "inbox" | "outbox";

export interface GatewayTimelinePanelProps {
  direction: GatewayTimelineDirection;
  entries: GatewayTimelineItem[];
  loading: boolean;
  onDirectionChange: (direction: GatewayTimelineDirection) => void;
  onPlatformChange: (platform: string) => void;
  onQueryChange: (query: string) => void;
  onReplay: (recordId: string) => void | Promise<void>;
  onRetryDelivery: (recordId: string) => void | Promise<void>;
  platform: string;
  platforms: string[];
  query: string;
  replayingId: string;
  retryingDeliveryId: string;
  visibleEntries: GatewayTimelineItem[];
}

export function GatewayTimelinePanel({
  direction,
  entries,
  loading,
  onDirectionChange,
  onPlatformChange,
  onQueryChange,
  onReplay,
  onRetryDelivery,
  platform,
  platforms,
  query,
  replayingId,
  retryingDeliveryId,
  visibleEntries,
}: GatewayTimelinePanelProps) {
  const [confirmReplayId, setConfirmReplayId] = useState("");
  const [confirmRetryId, setConfirmRetryId] = useState("");

  return (
    <section
      className="panel gateway-timeline-panel"
      aria-labelledby="gateway-timeline-title"
    >
      <div className="panel-heading gateway-heading">
        <div>
          <h2 id="gateway-timeline-title">Message history</h2>
        </div>
        {loading && !entries.length ? (
          <span className="muted-copy">Reading…</span>
        ) : entries.length ? (
          <span className="muted-copy">
            {visibleEntries.length} of {entries.length}
          </span>
        ) : null}
      </div>
      {entries.length > 0 ? (
        <fieldset className="gateway-filters">
          <legend className="sr-only">Gateway record filters</legend>
          <label>
            Direction
            <select
              onChange={(event) =>
                onDirectionChange(
                  event.target.value as GatewayTimelineDirection,
                )
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
              onChange={(event) => onPlatformChange(event.target.value)}
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
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Message, room, thread, or route"
              type="search"
              value={query}
            />
          </label>
        </fieldset>
      ) : null}

      {loading && !entries.length ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="gateway-history-state is-loading"
          role="status"
        >
          <span aria-hidden="true" className="gateway-history-state-dot" />
          <span className="gateway-history-state-copy">
            <strong>Reading message history</strong>
            <small>Checking the local inbox and outbox.</small>
          </span>
          <span className="gateway-history-state-meta">Local only</span>
        </div>
      ) : null}
      {!loading && !entries.length ? (
        <div
          aria-live="polite"
          className="gateway-history-state is-empty"
          role="status"
        >
          <span aria-hidden="true" className="gateway-history-state-dot" />
          <span className="gateway-history-state-copy">
            <strong>Waiting for gateway traffic</strong>
            <small>
              Real inbound and outbound records appear here. This view never
              creates test sends.
            </small>
          </span>
          <span className="gateway-history-state-meta">0 records</span>
        </div>
      ) : null}
      {entries.length > 0 && !visibleEntries.length ? (
        <EmptyBlock density="compact" title="No records match these filters">
          Adjust the direction, platform, or text filter.
        </EmptyBlock>
      ) : null}
      <ol className="gateway-timeline">
        {visibleEntries.map((entry) => (
          <li
            className={`gateway-entry ${entry.direction}`}
            key={`${entry.direction}:${entry.id}`}
          >
            <div className="gateway-entry-meta">
              <Badge tone={entry.direction === "inbox" ? "warn" : "neutral"}>
                {entry.direction === "inbox" ? "Inbound" : "Outbound"}
              </Badge>
              <Badge tone={gatewayStatusTone(entry.status)}>
                {titleCase(entry.status)}
              </Badge>
              <span>{titleCase(entry.platform)}</span>
              <time dateTime={entry.at}>{displayTimestamp(entry.at)}</time>
              {entry.direction === "inbox" ? (
                <button
                  aria-label={`Replay inbound ${titleCase(entry.platform)} message`}
                  className="text-button gateway-entry-replay"
                  disabled={Boolean(replayingId)}
                  onClick={() => setConfirmReplayId(entry.id)}
                  type="button"
                >
                  {replayingId === entry.id ? "Replaying…" : "Replay"}
                </button>
              ) : null}
              {entry.retryable ? (
                <button
                  aria-label={`Retry rejected ${titleCase(entry.platform)} delivery`}
                  className="text-button gateway-entry-replay"
                  disabled={Boolean(retryingDeliveryId)}
                  onClick={() => setConfirmRetryId(entry.id)}
                  type="button"
                >
                  {retryingDeliveryId === entry.id
                    ? "Retrying…"
                    : "Retry delivery"}
                </button>
              ) : entry.retryCompleted ? (
                <span>Retry delivered</span>
              ) : null}
            </div>
            <p>{entry.preview}</p>
            <details className="gateway-entry-details">
              <summary>Route details</summary>
              <div>
                <span>Route: {entry.sessionId || "Not recorded"}</span>
                <span>Room: {entry.roomId || "Not recorded"}</span>
                {entry.threadId ? <span>Thread: {entry.threadId}</span> : null}
                {entry.author ? <span>From: {entry.author}</span> : null}
                {entry.attachmentCount ? (
                  <span>
                    {entry.attachmentCount} attachment
                    {entry.attachmentCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </details>
            {confirmReplayId === entry.id ? (
              <InlineActionConfirmation
                busy={replayingId === entry.id}
                busyLabel="Replaying…"
                confirmLabel="Confirm replay"
                detail="Reprocesses this record on its original route and may produce a new external reply."
                onCancel={() => setConfirmReplayId("")}
                onConfirm={() => {
                  setConfirmReplayId("");
                  void onReplay(entry.id);
                }}
                title="Replay this inbound message?"
                tone="primary"
              />
            ) : null}
            {confirmRetryId === entry.id ? (
              <InlineActionConfirmation
                busy={retryingDeliveryId === entry.id}
                busyLabel="Retrying…"
                confirmLabel="Confirm delivery retry"
                detail="Resends the stored outbound payload on its original route without rerunning the agent or its tools."
                onCancel={() => setConfirmRetryId("")}
                onConfirm={() => {
                  setConfirmRetryId("");
                  void onRetryDelivery(entry.id);
                }}
                title="Retry this rejected delivery?"
                tone="primary"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
