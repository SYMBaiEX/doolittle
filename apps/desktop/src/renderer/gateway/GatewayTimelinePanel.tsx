import { useState } from "react";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import {
  type GatewayTimelineItem,
  gatewayStatusTone,
} from "../gateway-page-model";
import {
  Badge,
  displayTimestamp,
  EmptyBlock,
  LoadingBlock,
  titleCase,
} from "../lib";

export type GatewayTimelineDirection = "all" | "inbox" | "outbox";

export interface GatewayTimelinePanelProps {
  direction: GatewayTimelineDirection;
  entries: GatewayTimelineItem[];
  loading: boolean;
  onDirectionChange: (direction: GatewayTimelineDirection) => void;
  onPlatformChange: (platform: string) => void;
  onQueryChange: (query: string) => void;
  onReplay: (recordId: string) => void | Promise<void>;
  platform: string;
  platforms: string[];
  query: string;
  replayingId: string;
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
  platform,
  platforms,
  query,
  replayingId,
  visibleEntries,
}: GatewayTimelinePanelProps) {
  const [confirmReplayId, setConfirmReplayId] = useState("");

  return (
    <section
      className="panel gateway-timeline-panel"
      aria-labelledby="gateway-timeline-title"
    >
      <div className="panel-heading gateway-heading">
        <div>
          <span className="eyebrow">Recorded timeline</span>
          <h2 id="gateway-timeline-title">Inbound and outbound history</h2>
        </div>
        <span className="muted-copy">Newest first · local journal only</span>
      </div>
      <fieldset className="gateway-filters">
        <legend className="sr-only">Gateway record filters</legend>
        <label>
          Direction
          <select
            onChange={(event) =>
              onDirectionChange(event.target.value as GatewayTimelineDirection)
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

      {loading && !entries.length ? (
        <LoadingBlock label="Reading local gateway records…" />
      ) : null}
      {!loading && !entries.length ? (
        <EmptyBlock title="No gateway messages recorded yet">
          Configure a transport and wait for real traffic. This page does not
          create test sends.
        </EmptyBlock>
      ) : null}
      {entries.length > 0 && !visibleEntries.length ? (
        <EmptyBlock title="No records match these filters">
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
          </li>
        ))}
      </ol>
    </section>
  );
}
