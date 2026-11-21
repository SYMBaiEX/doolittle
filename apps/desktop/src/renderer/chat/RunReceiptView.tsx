import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePenLine,
  LoaderCircle,
  Minus,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { toolActionLabel } from "../components/tool-activity-details";
import { UiIcon } from "../components/UiIcon";
import { displayTimestamp } from "../lib";
import type { RunReceipt } from "./models";
import "./chat-activity.css";

type ActivityStatus =
  | "running"
  | "complete"
  | "failed"
  | "waiting"
  | "unreported";

export interface RunActivityItem {
  id: string;
  label: string;
  detail: string;
  status: ActivityStatus;
  update: DesktopRunUpdate;
  durationMs?: number;
}

interface OpenAction {
  index: number;
  started: number;
  timingAvailable: boolean;
}

function actionName(update: DesktopRunUpdate): string {
  return (
    (update.type === "action-started"
      ? update.run.activeAction
      : update.run.lastAction) || ""
  );
}

function lastMutation(run: DesktopRunUpdate["run"]) {
  return run.localMutations?.at(-1);
}

function ended(update: DesktopRunUpdate): boolean {
  return Boolean(
    update.run.endedAt ||
      update.run.terminalReason ||
      ["complete", "cancelled", "error"].includes(update.run.status),
  );
}

/** Project only the evidence recorded for this run, without inferring tool results. */
export function runActivityItems(receipt: RunReceipt): RunActivityItem[] {
  const items: RunActivityItem[] = [];
  const indexed = new Map<string, number>();
  const open = new Map<string, OpenAction>();
  function upsert(item: RunActivityItem) {
    const existing = indexed.get(item.id);
    if (existing !== undefined) {
      items[existing] = item;
      return existing;
    }
    const index = items.length;
    indexed.set(item.id, index);
    items.push(item);
    return index;
  }

  for (const update of receipt.events) {
    const { run, type } = update;
    if (type === "action-started" || type === "action-completed") {
      const name = actionName(update);
      const id = `action:${run.observedActionCount}:${name}`;
      const existing = open.get(id);
      const timestamp = Date.parse(run.updatedAt);
      const label = toolActionLabel(name) || "Agent action";
      if (type === "action-started") {
        if (indexed.has(id)) continue;
        const timingAvailable = open.size === 0;
        for (const previous of open.values()) previous.timingAvailable = false;
        open.set(id, {
          index: upsert({ id, label, detail: "", status: "running", update }),
          started: timestamp,
          timingAvailable,
        });
      } else {
        const elapsed = existing ? timestamp - existing.started : Number.NaN;
        const durationMs =
          existing?.timingAvailable && Number.isFinite(elapsed) && elapsed >= 0
            ? elapsed
            : indexed.has(id)
              ? items[indexed.get(id) ?? -1]?.durationMs
              : undefined;
        upsert({
          id,
          label,
          detail: "",
          status: "complete",
          update,
          durationMs,
        });
        open.delete(id);
      }
    } else if (type === "local-mutation") {
      const mutation = lastMutation(run);
      if (!mutation) continue;
      const path =
        mutation.resolvedPath || mutation.requestedPath || "Workspace";
      upsert({
        id: `mutation:${run.localMutations.length}:${mutation.recordedAt}`,
        label: mutation.success ? "Workspace changed" : "Change failed",
        detail: path,
        status: mutation.success ? "complete" : "failed",
        update,
      });
    } else if (type === "approvals") {
      const pending = run.pendingApprovals;
      const previous = items.at(-1);
      if (
        previous?.update.type === type &&
        previous.update.run.pendingApprovals === pending
      ) {
        continue;
      }
      const label =
        pending > 0 ? "Approval requested" : "Approval queue cleared";
      upsert({
        id: `approval:${run.updatedAt}:${pending}`,
        label,
        detail:
          pending > 0 ? `${formatCount(pending, "decision")} pending` : "",
        status: pending > 0 ? "waiting" : "complete",
        update,
      });
    }
  }

  if (ended(receipt.latest)) {
    for (const { index } of open.values()) {
      items[index] = { ...items[index], status: "unreported" };
    }
  }
  return items;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

type RunTone = "neutral" | "good" | "warn" | "bad";

export function runReceiptState(receipt: RunReceipt): {
  label: string;
  statusLabel: string;
  tone: RunTone;
} {
  const { run } = receipt.latest;
  if (run.status === "cancelled" || run.terminalReason === "cancelled") {
    return { label: "Run cancelled", statusLabel: "cancelled", tone: "warn" };
  }
  if (run.status === "error" || run.terminalReason === "error") {
    return { label: "Run failed", statusLabel: "failed", tone: "bad" };
  }
  if (run.status === "complete" || run.terminalReason === "completed") {
    return { label: "Run complete", statusLabel: "complete", tone: "good" };
  }
  if (run.pendingApprovals > 0) {
    return {
      label: "Approval needed",
      statusLabel: "approval needed",
      tone: "warn",
    };
  }
  return { label: "Working", statusLabel: "working", tone: "neutral" };
}

function runElapsed(update: DesktopRunUpdate, now: number): number | undefined {
  const start = Date.parse(update.run.startedAt);
  const terminal = update.run.endedAt
    ? Date.parse(update.run.endedAt)
    : ended(update)
      ? Date.parse(update.run.updatedAt)
      : now;
  if (!Number.isFinite(start) || !Number.isFinite(terminal)) return undefined;
  return Math.max(0, terminal - start);
}

export function formatRunElapsed(milliseconds: number): string {
  if (milliseconds < 1_000)
    return `${Math.max(0, Math.round(milliseconds))} ms`;
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export const RUN_STALL_THRESHOLD_MS = 12_000;

/** Heartbeats prove transport liveness, while meaningful work clears a stall. */
export function runIsStalled(
  receipt: RunReceipt,
  now: number,
  pending: boolean,
): boolean {
  if (
    !pending ||
    receipt.latest.run.pendingApprovals > 0 ||
    ended(receipt.latest)
  ) {
    return false;
  }
  const lastMeaningful = [
    receipt.latest.run.lastMeaningfulActivityAt,
    receipt.latest.run.updatedAt,
    receipt.latest.run.startedAt,
  ].reduce<number>((resolved, candidate) => {
    if (Number.isFinite(resolved) || !candidate) return resolved;
    return Date.parse(candidate);
  }, Number.NaN);
  return (
    Number.isFinite(lastMeaningful) &&
    now - lastMeaningful >= RUN_STALL_THRESHOLD_MS
  );
}

const statusIcons = {
  complete: Check,
  failed: X,
  waiting: Clock3,
  running: LoaderCircle,
  unreported: Minus,
};

function StatusMark({ status }: { status: ActivityStatus }) {
  return (
    <span
      aria-hidden="true"
      className="chat-activity-mark"
      data-status={status}
    >
      <UiIcon icon={statusIcons[status]} size="xs" />
    </span>
  );
}

function stepState(item: RunActivityItem): string {
  switch (item.status) {
    case "complete":
      return item.update.type === "action-completed" ? "Returned" : "Recorded";
    case "failed":
      return "Failed";
    case "waiting":
      return "Waiting";
    case "unreported":
      return "Result unavailable";
    default:
      return "Running";
  }
}

function RunDetail({ item }: { item: RunActivityItem }) {
  const mutation =
    item.update.type === "local-mutation"
      ? lastMutation(item.update.run)
      : undefined;
  const timestamp = item.update.run.updatedAt;
  return (
    <>
      <dl className="chat-activity-facts">
        <div>
          <dt>State</dt>
          <dd>{stepState(item)}</dd>
        </div>
        {Number.isFinite(Date.parse(timestamp)) ? (
          <div>
            <dt>Recorded</dt>
            <dd>
              <time dateTime={timestamp}>{displayTimestamp(timestamp)}</time>
            </dd>
          </div>
        ) : null}
        {item.durationMs !== undefined ? (
          <div>
            <dt>Duration</dt>
            <dd>{formatRunElapsed(item.durationMs)}</dd>
          </div>
        ) : null}
        {mutation?.bytes !== undefined ? (
          <div>
            <dt>Size</dt>
            <dd>{formatCount(mutation.bytes, "byte")}</dd>
          </div>
        ) : null}
        {mutation?.replacements !== undefined ? (
          <div>
            <dt>Replacements</dt>
            <dd>{mutation.replacements}</dd>
          </div>
        ) : null}
      </dl>
      {mutation ? (
        <div className="chat-activity-path">
          <UiIcon icon={FilePenLine} size="xs" />
          <code>{item.detail}</code>
        </div>
      ) : item.detail ? (
        <p className="chat-activity-note">{item.detail}</p>
      ) : null}
      {mutation?.message ? (
        <p className="chat-activity-note">{mutation.message}</p>
      ) : null}
    </>
  );
}

export function RunReceiptView({
  botName,
  pending,
  receipt,
  retryDisabled = false,
  onRetry,
}: {
  botName?: string;
  pending: boolean;
  receipt: RunReceipt;
  retryDisabled?: boolean;
  onRetry?: () => void;
}) {
  const id = useId();
  const state = runReceiptState(receipt);
  const items = useMemo(() => runActivityItems(receipt), [receipt]);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const { run } = receipt.latest;
  const terminal = ended(receipt.latest);
  const [clock, setClock] = useState(Date.now);

  useEffect(() => {
    if (!pending || terminal) return;
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [pending, terminal]);

  const elapsed = runElapsed(
    receipt.latest,
    pending ? clock : Date.parse(run.updatedAt),
  );
  const stalled = runIsStalled(receipt, clock, pending);
  const changedFiles = Array.from(
    new Set(
      (run.localMutations ?? [])
        .filter((mutation) => mutation.success)
        .map((mutation) => mutation.resolvedPath || mutation.requestedPath)
        .filter((path): path is string => Boolean(path)),
    ),
  );
  const failedChanges = (run.localMutations ?? []).filter(
    (mutation) => !mutation.success,
  ).length;
  const cancelled = state.statusLabel === "cancelled";
  const recoverable = state.tone === "bad" || cancelled;
  const summary = cancelled
    ? "Stopped by operator."
    : run.errorMessage?.includes("REQUESTED_LOCAL_MUTATION")
      ? "No file changes were verified. The agent stopped before returning a final answer."
      : run.errorMessage ||
        (recoverable
          ? run.statusDetail || "The run ended before it could finish."
          : "");
  const currentActivity = stalled
    ? "Waiting for the next update"
    : terminal
      ? changedFiles.length > 0
        ? `Changed ${formatCount(changedFiles.length, "file")}`
        : ""
      : run.pendingApprovals > 0
        ? `${formatCount(run.pendingApprovals, "decision")} pending`
        : toolActionLabel(run.activeAction ?? "") ||
          (run.status === "thinking"
            ? run.statusDetail || "Planning the next step"
            : "");
  const metrics = [
    run.observedActionCount > 0
      ? formatCount(run.observedActionCount, "action")
      : "",
    elapsed ? formatRunElapsed(elapsed) : "",
  ].filter(Boolean);

  const status: ActivityStatus =
    state.tone === "bad"
      ? "failed"
      : cancelled
        ? "unreported"
        : state.tone === "good"
          ? "complete"
          : state.tone === "warn"
            ? "waiting"
            : "running";
  const runLabel = stalled
    ? botName
      ? `${botName} is still working`
      : "Still working"
    : botName && state.statusLabel === "working"
      ? `${botName} is working`
      : state.label;

  return (
    <section
      aria-label="Run receipt"
      className="chat-activity chat-run-receipt"
      data-pending={pending ? "true" : "false"}
      data-stalled={stalled ? "true" : undefined}
      data-tone={state.tone}
    >
      <button
        aria-controls={`${id}-receipt`}
        aria-expanded={expanded}
        className="chat-activity-trigger"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <StatusMark status={status} />
        <span className="chat-activity-title">
          <strong aria-live={pending ? "polite" : undefined}>{runLabel}</strong>
          {currentActivity ? <small>{currentActivity}</small> : null}
        </span>
        {metrics.length ? (
          <span className="chat-activity-metric">{metrics.join(" · ")}</span>
        ) : null}
        <UiIcon
          className="chat-activity-chevron"
          icon={ChevronDown}
          size="xs"
        />
      </button>
      {recoverable ? (
        <div
          className="chat-activity-warning chat-activity-recovery"
          data-tone={state.tone}
        >
          <span>{summary}</span>
          {onRetry ? (
            <button
              aria-label="Retry this response in a new branch"
              className="chat-activity-copy"
              disabled={retryDisabled}
              onClick={onRetry}
              type="button"
            >
              <UiIcon icon={RotateCcw} size="xs" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        className="chat-activity-panel"
        hidden={!expanded}
        id={`${id}-receipt`}
      >
        {expanded ? (
          <>
            {items.length ? (
              <ol aria-label="Run steps" className="chat-activity-list">
                {items.map((item, index) => {
                  const selected = selectedId === item.id;
                  const detailId = `${id}-step-${index}`;
                  return (
                    <li key={item.id}>
                      <button
                        aria-controls={detailId}
                        aria-describedby={`${detailId}-state`}
                        aria-expanded={selected}
                        aria-label={`${selected ? "Hide" : "Show"} ${item.label} details`}
                        className="chat-activity-row"
                        onClick={() =>
                          setSelectedId(selected ? undefined : item.id)
                        }
                        type="button"
                      >
                        <StatusMark status={item.status} />
                        <span className="chat-activity-title">
                          <strong>{item.label}</strong>
                          {item.detail ? (
                            <small title={item.detail}>{item.detail}</small>
                          ) : null}
                        </span>
                        <span
                          className="chat-activity-row-metadata"
                          data-status={item.status}
                          id={`${detailId}-state`}
                        >
                          {stepState(item)}
                          {item.durationMs === undefined ? null : (
                            <small>{formatRunElapsed(item.durationMs)}</small>
                          )}
                        </span>
                        <UiIcon
                          className="chat-activity-chevron"
                          icon={ChevronRight}
                          size="xs"
                        />
                      </button>
                      <div
                        className="chat-activity-details"
                        hidden={!selected}
                        id={detailId}
                      >
                        {selected ? <RunDetail item={item} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : !changedFiles.length && !recoverable ? (
              <p className="chat-activity-note chat-activity-empty">
                {terminal
                  ? "No tool steps were recorded."
                  : "Tool steps will appear here as the run proceeds."}
              </p>
            ) : null}
            {changedFiles.length ? (
              <section
                aria-label="Changed files"
                className="chat-activity-files"
              >
                <strong>
                  Changed {formatCount(changedFiles.length, "file")}
                </strong>
                <ul>
                  {changedFiles.map((path) => (
                    <li className="chat-activity-path" key={path}>
                      <UiIcon icon={FilePenLine} size="xs" />
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {failedChanges > 0 ? (
              <p className="chat-activity-warning" data-tone="warn">
                <UiIcon icon={TriangleAlert} size="xs" />
                {formatCount(failedChanges, "failed file operation")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
