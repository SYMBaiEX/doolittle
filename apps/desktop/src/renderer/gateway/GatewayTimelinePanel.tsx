import { Input, NativeSelect } from "@doolittle/ui";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Inbox,
  MessagesSquare,
  RotateCw,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState } from "react";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import { UiIcon } from "../components/UiIcon";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  GATEWAY_HISTORY_LIMIT,
  type GatewayTimelineItem,
  gatewayStatusTone,
} from "../gateway-page-model";
import { Badge, displayTimestamp, LoadingBlock, titleCase } from "../lib";
import "../orchestration/work-surfaces.css";

export type GatewayTimelineDirection = "all" | "inbox" | "outbox";

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
  visibleEntries,
}: GatewayTimelinePanelProps) {
  const [confirmReplayId, setConfirmReplayId] = useState("");
  const [confirmRetryId, setConfirmRetryId] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const confirmationTrigger = useRef<HTMLButtonElement>(null);

  return (
    <WorkbenchSection
      className="gateway-timeline-panel"
      icon={MessagesSquare}
      title="Message history"
      description={`Latest ${GATEWAY_HISTORY_LIMIT} records in each direction`}
      actions={
        entries.length ? (
          <span className="work-list-count">
            {visibleEntries.length} of {entries.length}
          </span>
        ) : null
      }
    >
      {entries.length > 0 ? (
        <fieldset className="gateway-timeline-filters work-gateway-filters">
          <legend className="sr-only">Gateway record filters</legend>
          <label
            className="grid gap-2 text-[length:var(--text-control)] text-[var(--muted)]"
            htmlFor="gateway-record-direction"
          >
            Direction
            <NativeSelect
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
            </NativeSelect>
          </label>
          <label
            className="grid gap-2 text-[length:var(--text-control)] text-[var(--muted)]"
            htmlFor="gateway-record-platform"
          >
            Platform
            <NativeSelect
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
            </NativeSelect>
          </label>
          <label
            className="grid gap-2 text-[length:var(--text-control)] text-[var(--muted)]"
            htmlFor="gateway-record-query"
          >
            Find record
            <Input
              id="gateway-record-query"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Message, room, thread, or route"
              ref={search}
              type="search"
              value={query}
            />
          </label>
        </fieldset>
      ) : null}

      {!entries.length ? (
        <div
          data-gateway-history-state={
            loading ? "loading" : historyUnavailable ? "unavailable" : "empty"
          }
        >
          {loading ? (
            <LoadingBlock label="Reading message history" />
          ) : historyUnavailable ? (
            <div role="status">
              <WorkbenchEmpty
                title="Gateway history is unavailable"
                icon={TriangleAlert}
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
              >
                {historyError || "The local inbox or outbox could not be read."}
              </WorkbenchEmpty>
            </div>
          ) : (
            <WorkbenchEmpty title="Waiting for gateway traffic" icon={Inbox}>
              Inbound and outbound messages appear here when your connectors
              receive or send them.
            </WorkbenchEmpty>
          )}
        </div>
      ) : !visibleEntries.length ? (
        <WorkbenchEmpty
          title="No recent records match"
          icon={SearchX}
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
        >
          Search covers the latest {GATEWAY_HISTORY_LIMIT} inbound and{" "}
          {GATEWAY_HISTORY_LIMIT} outbound records.
        </WorkbenchEmpty>
      ) : null}
      <ol aria-label="Recent messages" className="work-gateway-records">
        {visibleEntries.map((entry) => (
          <li
            className="work-gateway-record"
            key={`${entry.direction}:${entry.id}`}
          >
            <div className="work-gateway-record__header">
              <span className="work-row-glyph">
                <UiIcon
                  icon={
                    entry.direction === "inbox" ? ArrowDownLeft : ArrowUpRight
                  }
                  size="md"
                />
              </span>
              <div className="work-gateway-record__identity">
                <strong>{titleCase(entry.platform)}</strong>
                <span>
                  {entry.direction === "inbox" ? "Inbound" : "Outbound"}
                  {" · "}
                  <time dateTime={entry.at}>{displayTimestamp(entry.at)}</time>
                </span>
              </div>
              <div className="work-gateway-record__actions">
                <Badge tone={gatewayStatusTone(entry.status)}>
                  {titleCase(entry.status)}
                </Badge>
                {entry.direction === "inbox" ? (
                  <WorkbenchAction
                    aria-label={`Replay inbound ${titleCase(entry.platform)} message`}
                    emphasis="quiet"
                    icon={RotateCw}
                    disabled={Boolean(replayingId)}
                    onClick={(event) => {
                      confirmationTrigger.current = event.currentTarget;
                      setConfirmRetryId("");
                      setConfirmReplayId(entry.id);
                    }}
                  >
                    {replayingId === entry.id ? "Replaying…" : "Replay"}
                  </WorkbenchAction>
                ) : null}
                {entry.retryable ? (
                  <WorkbenchAction
                    aria-label={`Retry rejected ${titleCase(entry.platform)} delivery`}
                    emphasis="quiet"
                    icon={RotateCw}
                    disabled={Boolean(retryingDeliveryId)}
                    onClick={(event) => {
                      confirmationTrigger.current = event.currentTarget;
                      setConfirmReplayId("");
                      setConfirmRetryId(entry.id);
                    }}
                  >
                    {retryingDeliveryId === entry.id
                      ? "Retrying…"
                      : "Retry delivery"}
                  </WorkbenchAction>
                ) : entry.retryCompleted ? (
                  <span>Retry delivered</span>
                ) : null}
              </div>
            </div>
            <div className="work-gateway-record__body">
              <p>{entry.preview}</p>
              <details className="work-route-details">
                <summary>
                  <UiIcon icon={ChevronDown} size="xs" />
                  Route details
                </summary>
                <dl>
                  <div>
                    <dt>Route</dt>
                    <dd>{entry.sessionId || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Room</dt>
                    <dd>{entry.roomId || "Not recorded"}</dd>
                  </div>
                  {entry.threadId ? (
                    <div>
                      <dt>Thread</dt>
                      <dd>{entry.threadId}</dd>
                    </div>
                  ) : null}
                  {entry.author ? (
                    <div>
                      <dt>From</dt>
                      <dd>{entry.author}</dd>
                    </div>
                  ) : null}
                  {entry.attachmentCount ? (
                    <div>
                      <dt>Attachments</dt>
                      <dd>{entry.attachmentCount}</dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            </div>
            {confirmReplayId === entry.id ? (
              <InlineActionConfirmation
                busy={replayingId === entry.id}
                busyLabel="Replaying…"
                confirmLabel="Confirm replay"
                detail="Reprocesses this record on its original route and may produce a new external reply."
                onCancel={() => {
                  confirmationTrigger.current?.focus();
                  setConfirmReplayId("");
                }}
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
                onCancel={() => {
                  confirmationTrigger.current?.focus();
                  setConfirmRetryId("");
                }}
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
    </WorkbenchSection>
  );
}
