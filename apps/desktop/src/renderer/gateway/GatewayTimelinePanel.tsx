import {
  Inbox,
  MessagesSquare,
  RotateCw,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import {
  WorkbenchAction,
  WorkbenchEmpty,
} from "../components/workbench/Workbench";
import {
  GATEWAY_HISTORY_LIMIT,
  type GatewayTimelineItem,
  gatewayEntryTier,
  gatewayRelativeTime,
} from "../gateway-page-model";
import { Badge, displayTimestamp, LoadingBlock, titleCase } from "../lib";
import type { WorkTier } from "../work-surface/status";
import {
  DetailFacts,
  DetailHeader,
  FactRow,
  WorkActions,
  WorkDetail,
  WorkDisclosure,
  WorkList,
  WorkRail,
  WorkRow,
  WorkSplit,
  WorkTag,
} from "../work-surface/WorkSurface";
import "./gateway-surface.css";

export type GatewayTimelineDirection = "all" | "inbox" | "outbox";

function entryKey(entry: GatewayTimelineItem) {
  return `${entry.direction}:${entry.id}`;
}

function tagTone(tier: WorkTier): "good" | "warn" | "bad" | "neutral" {
  if (tier === "done") return "good";
  if (tier === "attention") return "warn";
  if (tier === "failed") return "bad";
  return "neutral";
}

export interface GatewayTimelinePanelProps {
  direction: GatewayTimelineDirection;
  entries: GatewayTimelineItem[];
  historyError?: string;
  historyUnavailable?: boolean;
  loading: boolean;
  onDirectionChange: (direction: GatewayTimelineDirection) => void;
  onPlatformChange: (platform: string) => void;
  onQueryChange: (query: string) => void;
  onReplay: (recordId: string) => void | Promise<void>;
  onRetryDelivery: (recordId: string) => void | Promise<void>;
  onRetryHistory?: () => void;
  platform: string;
  platforms: string[];
  query: string;
  replayingId: string;
  retryingDeliveryId: string;
  secondary?: ReactNode;
  visibleEntries: GatewayTimelineItem[];
}

export function GatewayTimelinePanel({
  direction,
  entries,
  historyError,
  historyUnavailable = false,
  loading,
  onDirectionChange,
  onPlatformChange,
  onQueryChange,
  onReplay,
  onRetryDelivery,
  onRetryHistory,
  platform,
  platforms,
  query,
  replayingId,
  retryingDeliveryId,
  secondary,
  visibleEntries,
}: GatewayTimelinePanelProps) {
  const [selectedKey, setSelectedKey] = useState("");
  const [confirmReplayId, setConfirmReplayId] = useState("");
  const [confirmRetryId, setConfirmRetryId] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const confirmationTrigger = useRef<HTMLButtonElement>(null);
  const selectedEntry =
    visibleEntries.find((entry) => entryKey(entry) === selectedKey) ??
    visibleEntries[0];

  return (
    <WorkSplit>
      <WorkRail
        controls={
          entries.length ? (
            <>
              <label>
                <span className="sr-only">Direction</span>
                <select
                  aria-label="Direction"
                  id="gateway-record-direction"
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
                <span className="sr-only">Platform</span>
                <select
                  aria-label="Platform"
                  id="gateway-record-platform"
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
              <label className="gateway-filter-query">
                <span className="sr-only">Find record</span>
                <input
                  id="gateway-record-query"
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Message, room, thread, or route"
                  ref={search}
                  type="search"
                  value={query}
                />
              </label>
            </>
          ) : undefined
        }
        heading="Message history"
        meta={
          entries.length
            ? `${visibleEntries.length} of ${entries.length}`
            : `Latest ${GATEWAY_HISTORY_LIMIT} per direction`
        }
      >
        {!entries.length ? (
          loading ? (
            <LoadingBlock label="Reading message history" />
          ) : historyUnavailable ? (
            <WorkbenchEmpty
              actions={
                onRetryHistory ? (
                  <WorkbenchAction
                    emphasis="quiet"
                    icon={RotateCw}
                    onClick={onRetryHistory}
                  >
                    Retry history
                  </WorkbenchAction>
                ) : null
              }
              icon={TriangleAlert}
              title="Gateway history is unavailable"
            >
              {historyError || "The local inbox or outbox could not be read."}
            </WorkbenchEmpty>
          ) : (
            <WorkbenchEmpty icon={Inbox} title="Waiting for gateway traffic">
              Inbound and outbound messages appear here when your connectors
              receive or send them.
            </WorkbenchEmpty>
          )
        ) : !visibleEntries.length ? (
          <WorkbenchEmpty
            actions={
              <WorkbenchAction
                onClick={() => {
                  onDirectionChange("all");
                  onPlatformChange("all");
                  onQueryChange("");
                  search.current?.focus();
                }}
              >
                Clear filters
              </WorkbenchAction>
            }
            icon={SearchX}
            title="No recent records match"
          >
            Search covers the latest {GATEWAY_HISTORY_LIMIT} inbound and{" "}
            {GATEWAY_HISTORY_LIMIT} outbound records.
          </WorkbenchEmpty>
        ) : (
          <WorkList>
            {visibleEntries.map((entry) => {
              const directionLabel =
                entry.direction === "inbox" ? "Inbound" : "Outbound";
              return (
                <WorkRow
                  key={entryKey(entry)}
                  label={`${directionLabel} ${titleCase(entry.platform)} message · ${titleCase(entry.status)}`}
                  meta={[
                    titleCase(entry.platform),
                    directionLabel,
                    entry.author || entry.roomId,
                  ].filter(Boolean)}
                  onSelect={() => {
                    setSelectedKey(entryKey(entry));
                    setConfirmReplayId("");
                    setConfirmRetryId("");
                  }}
                  selected={entry === selectedEntry}
                  status={titleCase(entry.status)}
                  time={gatewayRelativeTime(entry.at)}
                  title={entry.preview}
                  tone={gatewayEntryTier(entry.status)}
                />
              );
            })}
          </WorkList>
        )}
      </WorkRail>
      <WorkDetail>
        {selectedEntry ? (
          <GatewayEntryDetail
            confirmReplayId={confirmReplayId}
            confirmRetryId={confirmRetryId}
            entry={selectedEntry}
            onCancelConfirm={() => {
              confirmationTrigger.current?.focus();
              setConfirmReplayId("");
              setConfirmRetryId("");
            }}
            onConfirmReplay={() => {
              setConfirmReplayId("");
              void onReplay(selectedEntry.id);
            }}
            onConfirmRetry={() => {
              setConfirmRetryId("");
              void onRetryDelivery(selectedEntry.id);
            }}
            onRequestConfirm={(kind, trigger) => {
              confirmationTrigger.current = trigger;
              setConfirmReplayId(kind === "replay" ? selectedEntry.id : "");
              setConfirmRetryId(kind === "retry" ? selectedEntry.id : "");
            }}
            replayingId={replayingId}
            retryingDeliveryId={retryingDeliveryId}
          />
        ) : (
          <WorkbenchEmpty icon={MessagesSquare} title="Choose a record">
            Select a message to inspect its route and delivery actions.
          </WorkbenchEmpty>
        )}
        {secondary}
      </WorkDetail>
    </WorkSplit>
  );
}

function GatewayEntryDetail({
  confirmReplayId,
  confirmRetryId,
  entry,
  onCancelConfirm,
  onConfirmReplay,
  onConfirmRetry,
  onRequestConfirm,
  replayingId,
  retryingDeliveryId,
}: {
  confirmReplayId: string;
  confirmRetryId: string;
  entry: GatewayTimelineItem;
  onCancelConfirm: () => void;
  onConfirmReplay: () => void;
  onConfirmRetry: () => void;
  onRequestConfirm: (
    kind: "replay" | "retry",
    trigger: HTMLButtonElement,
  ) => void;
  replayingId: string;
  retryingDeliveryId: string;
}) {
  const tier = gatewayEntryTier(entry.status);
  const directionLabel = entry.direction === "inbox" ? "Inbound" : "Outbound";
  const hasActions =
    entry.direction === "inbox" || entry.retryable || entry.retryCompleted;
  return (
    <>
      <DetailHeader
        kicker={`${directionLabel} · ${titleCase(entry.platform)}`}
        objective={entry.preview}
        status={<Badge tone={tagTone(tier)}>{titleCase(entry.status)}</Badge>}
        tags={
          <>
            <WorkTag>{displayTimestamp(entry.at)}</WorkTag>
            {entry.author ? <WorkTag>from {entry.author}</WorkTag> : null}
            {entry.attachmentCount ? (
              <WorkTag>
                {entry.attachmentCount} attachment
                {entry.attachmentCount === 1 ? "" : "s"}
              </WorkTag>
            ) : null}
            {entry.retryCompleted ? (
              <WorkTag tone="good">retry delivered</WorkTag>
            ) : null}
          </>
        }
        title={`${titleCase(entry.platform)} message`}
      />
      {hasActions ? (
        <WorkActions
          primary={
            <>
              {entry.direction === "inbox" ? (
                <button
                  aria-label={`Replay inbound ${titleCase(entry.platform)} message`}
                  className="secondary-button"
                  disabled={Boolean(replayingId)}
                  onClick={(event) =>
                    onRequestConfirm("replay", event.currentTarget)
                  }
                  type="button"
                >
                  {replayingId === entry.id ? "Replaying…" : "Replay"}
                </button>
              ) : null}
              {entry.retryable ? (
                <button
                  aria-label={`Retry rejected ${titleCase(entry.platform)} delivery`}
                  className="secondary-button"
                  disabled={Boolean(retryingDeliveryId)}
                  onClick={(event) =>
                    onRequestConfirm("retry", event.currentTarget)
                  }
                  type="button"
                >
                  {retryingDeliveryId === entry.id
                    ? "Retrying…"
                    : "Retry delivery"}
                </button>
              ) : null}
            </>
          }
          secondary={
            entry.retryCompleted ? (
              <span className="gateway-retry-note">Retry delivered</span>
            ) : undefined
          }
        />
      ) : null}
      {confirmReplayId === entry.id ? (
        <InlineActionConfirmation
          busy={replayingId === entry.id}
          busyLabel="Replaying…"
          confirmLabel="Confirm replay"
          detail="Reprocesses this record on its original route and may produce a new external reply."
          onCancel={onCancelConfirm}
          onConfirm={onConfirmReplay}
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
          onCancel={onCancelConfirm}
          onConfirm={onConfirmRetry}
          title="Retry this rejected delivery?"
          tone="primary"
        />
      ) : null}
      <WorkDisclosure
        aside={titleCase(entry.platform)}
        detail="Session, room, and thread identifiers"
        summary="Route details"
      >
        <DetailFacts>
          <FactRow label="Route">{entry.sessionId || "Not recorded"}</FactRow>
          <FactRow label="Room">{entry.roomId || "Not recorded"}</FactRow>
          {entry.threadId ? (
            <FactRow label="Thread">{entry.threadId}</FactRow>
          ) : null}
          {entry.author ? <FactRow label="From">{entry.author}</FactRow> : null}
          {entry.attachmentCount ? (
            <FactRow label="Attachments">{entry.attachmentCount}</FactRow>
          ) : null}
          <FactRow label="Recorded">{displayTimestamp(entry.at)}</FactRow>
          <FactRow label="Record">{entry.id}</FactRow>
        </DetailFacts>
      </WorkDisclosure>
    </>
  );
}
