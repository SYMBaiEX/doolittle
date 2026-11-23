import {
  Check,
  ChevronRight,
  Clock3,
  FileDiff,
  FilePenLine,
  LoaderCircle,
  Minus,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolPayload } from "../components/ToolActivityGroup";
import { toolActionLabel } from "../components/tool-activity-details";
import { UiIcon } from "../components/UiIcon";
import { displayTimestamp } from "../lib";
import type { RunReceipt } from "./models";
import {
  type ActivityStatus,
  ended,
  formatCount,
  formatRunElapsed,
  lastMutation,
  type RunActivityItem,
  runActivityItems,
  runIsStalled,
  runReceiptState,
} from "./run-activity";
import "./chat-activity.css";

const statusIcons = {
  complete: Check,
  failed: X,
  cancelled: Minus,
  queued: Clock3,
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
  const exitCode = item.activity?.exitCode;
  if (typeof exitCode === "number")
    return `${item.status === "failed" ? "Failed · " : ""}Exit ${exitCode}`;
  switch (item.status) {
    case "complete":
      return item.activity?.phase === "completed"
        ? "Completed"
        : item.update.type === "action-completed"
          ? "Returned"
          : "Recorded";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Stopped";
    case "queued":
      return "Queued";
    case "waiting":
      return "Waiting";
    case "unreported":
      return "Result unavailable";
    default:
      return "Running";
  }
}

function stepHasDetails(item: RunActivityItem): boolean {
  const activity = item.activity;
  return Boolean(
    item.durationMs !== undefined ||
      item.update.type === "local-mutation" ||
      activity?.command ||
      activity?.commandDetail ||
      activity?.directory ||
      activity?.paths?.length ||
      activity?.summary ||
      activity?.output ||
      activity?.title,
  );
}

function RunDetail({ item }: { item: RunActivityItem }) {
  const mutation =
    item.update.type === "local-mutation"
      ? lastMutation(item.update.run)
      : undefined;
  const timestamp = item.update.run.updatedAt;
  const activity = item.activity;
  const mutationPath = mutation?.resolvedPath || mutation?.requestedPath;
  const paths = mutationPath ? [mutationPath] : [...new Set(activity?.paths)];
  const command = activity?.commandDetail ?? activity?.command;
  return (
    <>
      <dl className="chat-activity-facts">
        {activity?.origin === "delegated" ? (
          <div>
            <dt>Source</dt>
            <dd>Delegated worker</dd>
          </div>
        ) : null}
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
        {activity?.directory ? (
          <div className="chat-activity-directory">
            <dt>Working directory</dt>
            <dd>
              <code>{activity.directory}</code>
            </dd>
          </div>
        ) : null}
      </dl>
      {activity?.summary || mutation?.message || activity?.title ? (
        <p className="chat-activity-note chat-activity-tool-summary">
          {activity?.summary || mutation?.message || activity?.title}
        </p>
      ) : null}
      {command ? (
        <ToolPayload
          copyLabel="Copy command"
          kind="command"
          label="Command"
          text={command}
        />
      ) : null}
      {paths?.length ? (
        <ul aria-label="Paths" className="chat-activity-paths">
          {paths.map((path) => (
            <li className="chat-activity-path" key={path}>
              <UiIcon icon={FilePenLine} size="xs" />
              <code>{path}</code>
            </li>
          ))}
        </ul>
      ) : null}
      {activity?.output ? (
        <ToolPayload
          label="Output"
          copyLabel="Copy output"
          text={activity.output}
        />
      ) : null}
    </>
  );
}

function RunStep({
  item,
  selected,
  onToggle,
}: {
  item: RunActivityItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const detailId = useId();
  const expandable = stepHasDetails(item);
  const row = (
    <>
      <StatusMark status={item.status} />
      <span className="chat-activity-title">
        <strong>{item.label}</strong>
        {item.detail ? (
          <small id={`${detailId}-target`} title={item.detail}>
            {item.detail}
          </small>
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
      {expandable ? (
        <UiIcon
          className="chat-activity-chevron"
          icon={ChevronRight}
          size="xs"
        />
      ) : null}
    </>
  );

  return (
    <li data-tool-origin={item.activity?.origin} data-step-status={item.status}>
      {expandable ? (
        <>
          <button
            aria-controls={detailId}
            aria-describedby={
              item.detail
                ? `${detailId}-target ${detailId}-state`
                : `${detailId}-state`
            }
            aria-expanded={selected}
            aria-label={`${selected ? "Hide" : "Show"} ${item.label} details`}
            className="chat-activity-row"
            onClick={onToggle}
            type="button"
          >
            {row}
          </button>
          <div
            className="chat-activity-details"
            hidden={!selected}
            id={detailId}
          >
            {selected ? <RunDetail item={item} /> : null}
          </div>
        </>
      ) : (
        <div className="chat-activity-row">{row}</div>
      )}
    </li>
  );
}

export function RunReceiptView({
  botName,
  pending,
  progress,
  receipt,
  retryDisabled = false,
  onRetry,
  onViewChanges,
}: {
  botName?: string;
  pending: boolean;
  progress?: string;
  receipt: RunReceipt;
  retryDisabled?: boolean;
  onRetry?: () => void;
  onViewChanges?: () => void;
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

  const stalled = runIsStalled(receipt, clock, pending);
  const startedAtMs = Date.parse(run.startedAt);
  const endedAtMs = Date.parse(run.endedAt ?? run.updatedAt);
  const elapsedLabel =
    Number.isFinite(startedAtMs) && (pending || terminal)
      ? formatRunElapsed(
          Math.max(
            0,
            (terminal && Number.isFinite(endedAtMs) ? endedAtMs : clock) -
              startedAtMs,
          ),
        )
      : undefined;
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
  const activeStep = useMemo(
    () => items.filter((item) => item.status === "running").at(-1),
    [items],
  );
  const activeTarget = activeStep?.detail || "";
  const reportedProgress = pending && !terminal ? progress?.trim() : undefined;
  const liveProgress = reportedProgress?.replace(/\s+/gu, " ");
  const currentActivity = terminal
    ? changedFiles.length > 0
      ? `Changed ${formatCount(changedFiles.length, "file")}`
      : ""
    : run.pendingApprovals > 0
      ? `${formatCount(run.pendingApprovals, "decision")} pending`
      : activeTarget ||
        activeStep?.label ||
        toolActionLabel(run.activeAction ?? "") ||
        liveProgress ||
        run.statusDetail ||
        (stalled ? "Waiting for the next update" : "");
  const status: ActivityStatus =
    state.tone === "bad"
      ? "failed"
      : cancelled
        ? "cancelled"
        : state.tone === "good"
          ? "complete"
          : state.statusLabel === "queued"
            ? "queued"
            : state.tone === "warn" || stalled
              ? "waiting"
              : "running";
  const runLabel = stalled
    ? "Waiting for an update"
    : activeStep && state.statusLabel === "working"
      ? activeStep.label
      : botName && state.label === "Working"
        ? `${botName} is working`
        : state.label;
  const displayActivity = currentActivity === runLabel ? "" : currentActivity;
  const showProgress =
    Boolean(liveProgress && liveProgress !== displayActivity) &&
    (run.pendingApprovals > 0 || !activeStep);

  return (
    <section
      aria-label="Run receipt"
      className="chat-activity chat-run-receipt"
      data-pending={pending ? "true" : "false"}
      data-stalled={stalled ? "true" : undefined}
      data-tone={state.tone}
    >
      <span className="sr-only" role="status">
        {[runLabel, displayActivity, showProgress ? liveProgress : undefined]
          .filter(Boolean)
          .join(". ")}
      </span>
      <button
        aria-controls={`${id}-receipt`}
        aria-expanded={expanded}
        aria-label={runLabel}
        className="chat-activity-trigger"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <StatusMark status={status} />
        <span className="chat-activity-title">
          <strong>{runLabel}</strong>
          {displayActivity ? (
            <small title={displayActivity}>{displayActivity}</small>
          ) : null}
          {elapsedLabel ? (
            <small title={displayTimestamp(run.startedAt)}>
              {elapsedLabel}
            </small>
          ) : null}
        </span>
        <UiIcon
          className="chat-activity-chevron"
          icon={ChevronRight}
          size="xs"
        />
      </button>
      {terminal && changedFiles.length > 0 && onViewChanges ? (
        <button
          className="chat-activity-copy"
          onClick={onViewChanges}
          type="button"
        >
          <UiIcon icon={FileDiff} size="xs" />
          View changes
        </button>
      ) : null}
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
            {showProgress ? (
              <p className="chat-activity-note chat-activity-progress">
                {liveProgress}
              </p>
            ) : null}
            {items.length ? (
              <ol aria-label="Run steps" className="chat-activity-list">
                {items.map((item) => (
                  <RunStep
                    item={item}
                    key={item.id}
                    onToggle={() =>
                      setSelectedId(
                        selectedId === item.id ? undefined : item.id,
                      )
                    }
                    selected={selectedId === item.id}
                  />
                ))}
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
                {onViewChanges ? (
                  <button
                    className="chat-activity-copy"
                    onClick={onViewChanges}
                    type="button"
                  >
                    <UiIcon icon={FileDiff} size="xs" />
                    View changes
                  </button>
                ) : null}
                <ul>
                  {changedFiles.map((path) => (
                    <li className="chat-activity-path" key={path}>
                      <UiIcon icon={FilePenLine} size="xs" />
                      <code title={path}>
                        <span aria-hidden="true">
                          {path
                            .split(/[/\\]+/u)
                            .filter(Boolean)
                            .slice(-3)
                            .join("/")}
                        </span>
                        <span className="sr-only">{path}</span>
                      </code>
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
