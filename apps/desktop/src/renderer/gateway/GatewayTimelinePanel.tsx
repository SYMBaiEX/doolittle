import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { useState } from "react";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import {
  type GatewayTimelineItem,
  gatewayStatusTone,
} from "../gateway-page-model";
import { Badge, displayTimestamp, EmptyBlock, titleCase } from "../lib";
import {
  GATEWAY_ENTRY_CLASS,
  GATEWAY_FILTER_CONTROL_CLASS,
  GATEWAY_HISTORY_STATE_CLASS,
  GATEWAY_META_CLASS,
  GATEWAY_TIMELINE_CLASS,
} from "./gateway-layout";

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
      aria-labelledby="gateway-timeline-title"
      className="gateway-timeline-panel panel min-w-0"
    >
      <div className="panel-heading items-center">
        <div>
          <h2 className="m-0 text-base" id="gateway-timeline-title">
            Message history
          </h2>
        </div>
        {loading && !entries.length ? (
          <span className={GATEWAY_META_CLASS}>Reading…</span>
        ) : entries.length ? (
          <span className={GATEWAY_META_CLASS}>
            {visibleEntries.length} of {entries.length}
          </span>
        ) : null}
      </div>
      {entries.length > 0 ? (
        <fieldset className="m-0 grid min-w-0 grid-cols-[minmax(120px,0.5fr)_minmax(130px,0.6fr)_minmax(200px,1fr)] gap-2.25 border-x-0 border-y border-[var(--border)] px-0 py-2.25 max-[620px]:grid-cols-1">
          <legend className="sr-only">Gateway record filters</legend>
          <label className="grid gap-1.25 font-mono text-[10px] text-[var(--muted)]">
            Direction
            <select
              className={GATEWAY_FILTER_CONTROL_CLASS}
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
          <label className="grid gap-1.25 font-mono text-[10px] text-[var(--muted)]">
            Platform
            <select
              className={GATEWAY_FILTER_CONTROL_CLASS}
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
          <label
            className="grid gap-1.25 font-mono text-[10px] text-[var(--muted)]"
            htmlFor="gateway-record-query"
          >
            Find record
            <Input
              className={GATEWAY_FILTER_CONTROL_CLASS}
              id="gateway-record-query"
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
          className={GATEWAY_HISTORY_STATE_CLASS}
          data-gateway-history-state="loading"
          role="status"
        >
          <span
            aria-hidden="true"
            className="size-1.75 animate-pulse rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_10%,transparent)] motion-reduce:animate-none"
          />
          <span className="grid min-w-0 gap-0.5">
            <strong className="text-[13px] font-semibold">
              Reading message history
            </strong>
            <small className={GATEWAY_META_CLASS}>
              Checking the local inbox and outbox.
            </small>
          </span>
          <span
            className={`${GATEWAY_META_CLASS} whitespace-nowrap uppercase max-[620px]:col-start-2`}
          >
            Local only
          </span>
        </div>
      ) : null}
      {!loading && !entries.length ? (
        <div
          aria-live="polite"
          className={GATEWAY_HISTORY_STATE_CLASS}
          data-gateway-history-state="empty"
          role="status"
        >
          <span
            aria-hidden="true"
            className="size-1.75 rounded-full bg-[color-mix(in_srgb,var(--muted)_72%,transparent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--muted)_8%,transparent)]"
          />
          <span className="grid min-w-0 gap-0.5">
            <strong className="text-[13px] font-semibold">
              Waiting for gateway traffic
            </strong>
            <small className={GATEWAY_META_CLASS}>
              Real inbound and outbound records appear here. This view never
              creates test sends.
            </small>
          </span>
          <span
            className={`${GATEWAY_META_CLASS} whitespace-nowrap uppercase max-[620px]:col-start-2`}
          >
            0 records
          </span>
        </div>
      ) : null}
      {entries.length > 0 && !visibleEntries.length ? (
        <EmptyBlock density="compact" title="No records match these filters">
          Adjust the direction, platform, or text filter.
        </EmptyBlock>
      ) : null}
      <ol className={GATEWAY_TIMELINE_CLASS}>
        {visibleEntries.map((entry) => (
          <li
            className={`${GATEWAY_ENTRY_CLASS} ${
              entry.direction === "inbox"
                ? "border-l-2 border-l-[color-mix(in_srgb,var(--accent)_72%,transparent)] pl-2.75"
                : ""
            }`}
            key={`${entry.direction}:${entry.id}`}
          >
            <div className="flex flex-wrap items-center gap-1.75 [&>span:not(.badge)]:font-mono [&>span:not(.badge)]:text-[10px] [&>span:not(.badge)]:text-[var(--muted)] [&>time]:font-mono [&>time]:text-[10px] [&>time]:text-[var(--muted)]">
              <Badge tone={entry.direction === "inbox" ? "warn" : "neutral"}>
                {entry.direction === "inbox" ? "Inbound" : "Outbound"}
              </Badge>
              <Badge tone={gatewayStatusTone(entry.status)}>
                {titleCase(entry.status)}
              </Badge>
              <span>{titleCase(entry.platform)}</span>
              <time dateTime={entry.at}>{displayTimestamp(entry.at)}</time>
              {entry.direction === "inbox" ? (
                <Button
                  aria-label={`Replay inbound ${titleCase(entry.platform)} message`}
                  className="ml-auto h-auto p-0 text-[10px]"
                  disabled={Boolean(replayingId)}
                  onClick={() => setConfirmReplayId(entry.id)}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  {replayingId === entry.id ? "Replaying…" : "Replay"}
                </Button>
              ) : null}
              {entry.retryable ? (
                <Button
                  aria-label={`Retry rejected ${titleCase(entry.platform)} delivery`}
                  className="ml-auto h-auto p-0 text-[10px]"
                  disabled={Boolean(retryingDeliveryId)}
                  onClick={() => setConfirmRetryId(entry.id)}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  {retryingDeliveryId === entry.id
                    ? "Retrying…"
                    : "Retry delivery"}
                </Button>
              ) : entry.retryCompleted ? (
                <span>Retry delivered</span>
              ) : null}
            </div>
            <p className="m-0 whitespace-pre-wrap text-[var(--text)] leading-normal">
              {entry.preview}
            </p>
            <details className="group block pt-px font-mono text-[10px] text-[var(--muted)]">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.25 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="group-open:hidden">
                  +
                </span>
                <span aria-hidden="true" className="hidden group-open:inline">
                  −
                </span>
                Route details
              </summary>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5">
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
