import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePenLine,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import { displayTimestamp } from "../lib";
import {
  type RunReceipt,
  runActionLabel,
  runEventCopy,
  runEventKey,
} from "./models";

type RunTone = "neutral" | "good" | "warn" | "bad";
type ActivityStatus = "running" | "complete" | "failed" | "waiting";

export interface RunActivityItem {
  id: string;
  label: string;
  detail: string;
  status: ActivityStatus;
  tone: RunTone;
  update: DesktopRunUpdate;
}

const HIDDEN_EVENT_TYPES = new Set(["heartbeat", "message", "stream"]);

function activityStatus(update: DesktopRunUpdate): ActivityStatus {
  if (update.type === "error" || update.type === "cancelled") return "failed";
  if (update.type === "action-completed" || update.type === "completed") {
    return "complete";
  }
  if (update.type === "local-mutation") {
    return update.run.localMutations.at(-1)?.success ? "complete" : "failed";
  }
  if (update.type === "waiting" || update.type === "approvals")
    return "waiting";
  return "running";
}

function actionIdentity(update: DesktopRunUpdate): string | undefined {
  if (update.type === "action-started") {
    return `${update.run.observedActionCount}:${update.run.activeAction ?? "tool"}`;
  }
  if (update.type === "action-completed") {
    return `${update.run.observedActionCount}:${update.run.lastAction ?? "tool"}`;
  }
  return undefined;
}

/** Condense noisy lifecycle snapshots into stable operator-facing activity rows. */
export function runActivityItems(receipt: RunReceipt): RunActivityItem[] {
  const items: RunActivityItem[] = [];
  const actionIndexes = new Map<string, number>();

  for (const update of receipt.events) {
    if (HIDDEN_EVENT_TYPES.has(update.type) || update.type === "acting")
      continue;
    const copy = runEventCopy(update);
    const item: RunActivityItem = {
      id: `${runEventKey(update)}:${update.run.updatedAt}`,
      label: copy.label,
      detail: copy.detail,
      status: activityStatus(update),
      tone: copy.tone,
      update,
    };
    const identity = actionIdentity(update);
    if (identity) {
      const existing = actionIndexes.get(identity);
      if (existing !== undefined) {
        items[existing] = item;
        continue;
      }
      actionIndexes.set(identity, items.length);
    }

    const previous = items.at(-1);
    if (
      previous &&
      ["thinking", "waiting", "approvals"].includes(update.type) &&
      previous.update.type === update.type &&
      previous.label === item.label &&
      previous.detail === item.detail
    ) {
      items[items.length - 1] = item;
      continue;
    }
    items.push(item);
  }

  return items.slice(-18);
}

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

function elapsedMilliseconds(update: DesktopRunUpdate, now: number): number {
  const start = Date.parse(update.run.startedAt);
  const terminal = update.run.endedAt
    ? Date.parse(update.run.endedAt)
    : update.run.terminalReason
      ? Date.parse(update.run.updatedAt)
      : now;
  if (!Number.isFinite(start) || !Number.isFinite(terminal)) return 0;
  return Math.max(0, terminal - start);
}

export function formatRunElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export const RUN_STALL_THRESHOLD_MS = 12_000;

/** Heartbeats prove transport liveness, but only meaningful work clears a stall. */
export function runIsStalled(
  receipt: RunReceipt,
  now: number,
  pending: boolean,
): boolean {
  if (
    !pending ||
    receipt.latest.run.pendingApprovals > 0 ||
    receipt.latest.run.endedAt ||
    receipt.latest.run.terminalReason ||
    ["complete", "cancelled", "error"].includes(receipt.latest.run.status)
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

function StatusMark({ status }: { status: ActivityStatus }) {
  const icon =
    status === "complete"
      ? Check
      : status === "failed"
        ? X
        : status === "waiting"
          ? Clock3
          : LoaderCircle;
  return (
    <span
      aria-hidden="true"
      className={`grid size-5 shrink-0 place-items-center rounded-full border ${
        status === "complete"
          ? "border-[color-mix(in_srgb,var(--good)_35%,transparent)] bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-[var(--good)]"
          : status === "failed"
            ? "border-[color-mix(in_srgb,var(--bad)_42%,transparent)] bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-[var(--bad)]"
            : status === "waiting"
              ? "border-[color-mix(in_srgb,var(--warn)_38%,transparent)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-[var(--warn)]"
              : "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"
      }`}
    >
      <UiIcon
        className={
          status === "running"
            ? "animate-spin motion-reduce:animate-none"
            : undefined
        }
        icon={icon}
        size="xs"
      />
    </span>
  );
}

function RunDetail({ item }: { item: RunActivityItem }) {
  const mutation =
    item.update.type === "local-mutation"
      ? item.update.run.localMutations.at(-1)
      : undefined;
  return (
    <section
      aria-label={`${item.label} details`}
      className="min-w-0 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-t bg-[color-mix(in_srgb,var(--surface-soft)_34%,transparent)] px-3 py-2.5"
    >
      <header className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <StatusMark status={item.status} />
          <strong className="truncate text-[length:var(--text-control)] font-semibold text-[var(--text)]">
            {item.label}
          </strong>
        </span>
        <time className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)]">
          {displayTimestamp(item.update.run.updatedAt)}
        </time>
      </header>
      <p className="mt-2 mb-0 whitespace-pre-wrap text-[length:var(--text-meta)] leading-[1.55] text-[var(--muted)]">
        {item.detail}
      </p>
      {mutation ? (
        <div className="mt-2 flex min-w-0 items-center gap-2 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--text-soft)]">
          <UiIcon
            className="text-[var(--faint)]"
            icon={FilePenLine}
            size="xs"
          />
          <span className="truncate">
            {mutation.resolvedPath || mutation.requestedPath || "Workspace"}
          </span>
          {mutation.bytes === undefined ? null : (
            <small className="ml-auto shrink-0 text-[var(--faint)]">
              {mutation.bytes} bytes
            </small>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function RunReceiptView({
  pending,
  receipt,
  retryDisabled = false,
  onRetry,
}: {
  pending: boolean;
  receipt: RunReceipt;
  retryDisabled?: boolean;
  onRetry?: () => void;
}) {
  const state = runReceiptState(receipt);
  const items = useMemo(() => runActivityItems(receipt), [receipt]);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState(() =>
    Date.parse(receipt.latest.run.endedAt || receipt.latest.run.updatedAt),
  );

  useEffect(() => {
    if (!pending) return;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [pending]);

  const selected =
    items.find((item) => item.id === selectedId) ?? items.at(-1) ?? null;
  const elapsed = formatRunElapsed(elapsedMilliseconds(receipt.latest, clock));
  const stalled = runIsStalled(receipt, clock, pending);
  const changedFiles = Array.from(
    new Set(
      receipt.latest.run.localMutations
        .filter((mutation) => mutation.success)
        .map((mutation) => mutation.resolvedPath || mutation.requestedPath)
        .filter((path): path is string => Boolean(path)),
    ),
  );
  const failedChanges = receipt.latest.run.localMutations.filter(
    (mutation) => !mutation.success,
  );
  const summary =
    receipt.latest.run.terminalReason === "cancelled"
      ? "Stopped by operator"
      : receipt.latest.run.pendingApprovals > 0
        ? `${receipt.latest.run.pendingApprovals} approval${receipt.latest.run.pendingApprovals === 1 ? "" : "s"} awaiting your decision`
        : receipt.latest.run.errorMessage ||
          receipt.latest.run.activeAction ||
          receipt.latest.run.statusDetail ||
          receipt.latest.run.lastAction ||
          receipt.latest.run.status;
  const currentActivity = stalled
    ? "Waiting for the next update"
    : state.tone === "good" && changedFiles.length > 0
      ? `Changed ${changedFiles.length} ${changedFiles.length === 1 ? "file" : "files"}`
      : runActionLabel(receipt.latest.run.activeAction) ||
        (receipt.latest.run.status === "thinking"
          ? receipt.latest.run.statusDetail || "Planning the next step"
          : runActionLabel(receipt.latest.run.lastAction) || state.label);
  const visibleMetric = `${receipt.latest.run.observedActionCount > 0 ? `${receipt.latest.run.observedActionCount} ${receipt.latest.run.observedActionCount === 1 ? "action" : "actions"} · ` : ""}${elapsed}`;
  const recoverable =
    state.tone === "bad" || receipt.latest.run.terminalReason === "cancelled";
  const failureSummary = summary.includes("REQUESTED_LOCAL_MUTATION")
    ? "No verified file change was completed."
    : summary;

  return (
    <section
      className={`chat-run-receipt mb-2 overflow-hidden rounded-[var(--radius-sm)] border border-l-2 whitespace-normal ${
        state.tone === "bad"
          ? "border-[color-mix(in_srgb,var(--bad)_34%,var(--border))] border-l-[var(--bad)]"
          : pending
            ? "border-[color-mix(in_srgb,var(--border)_78%,transparent)] border-l-[var(--accent)]"
            : "border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-l-[var(--border-strong)]"
      } bg-[color-mix(in_srgb,var(--surface-soft)_58%,var(--bg))]`}
      data-pending={pending ? "true" : "false"}
      data-stalled={stalled ? "true" : undefined}
    >
      <button
        aria-expanded={expanded}
        className="grid min-h-10 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-0 bg-transparent px-2.5 py-1.5 text-left hover:bg-[color-mix(in_srgb,var(--surface-hover)_64%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <StatusMark
          status={
            state.tone === "bad"
              ? "failed"
              : state.tone === "good"
                ? "complete"
                : state.tone === "warn"
                  ? "waiting"
                  : "running"
          }
        />
        <span className="flex min-w-0 items-baseline gap-2">
          <strong
            aria-live={pending ? "polite" : undefined}
            className="shrink-0 text-[length:var(--text-control)] font-semibold text-[var(--text)]"
          >
            {stalled ? "Still working" : state.label}
          </strong>
          {currentActivity === state.label ? null : (
            <small className="truncate text-[length:var(--text-meta)] text-[var(--muted)]">
              {currentActivity}
            </small>
          )}
        </span>
        <span className="whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] max-[520px]:hidden">
          {visibleMetric}
        </span>
        <UiIcon
          className={`text-[var(--faint)] transition-transform duration-150 ${expanded ? "rotate-180" : ""} motion-reduce:transition-none`}
          icon={ChevronDown}
          size="xs"
        />
      </button>
      {pending ? (
        <span
          aria-hidden="true"
          className="block h-px w-full animate-pulse bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] motion-reduce:animate-none"
        />
      ) : null}
      {!expanded && recoverable ? (
        <div className="flex min-w-0 items-center gap-2 border-[var(--border)] border-t px-2.5 py-1.5">
          <p className="m-0 min-w-0 flex-1 text-[length:var(--text-meta)] leading-relaxed text-[var(--muted)]">
            {failureSummary}
          </p>
          {onRetry ? (
            <button
              className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[length:var(--text-meta)] font-semibold text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={retryDisabled}
              aria-label="Retry this response in a new branch"
              onClick={onRetry}
              type="button"
            >
              <UiIcon icon={RotateCcw} size="xs" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {expanded ? (
        <div className="border-[var(--border)] border-t">
          {changedFiles.length > 0 ? (
            <section aria-label="Changed files" className="px-3 py-2">
              <strong className="text-[length:var(--text-meta)] font-semibold text-[var(--text-soft)]">
                Changed {changedFiles.length}{" "}
                {changedFiles.length === 1 ? "file" : "files"}
              </strong>
              <ul className="mt-1 mb-0 grid list-none gap-1 p-0 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                {changedFiles.slice(0, 8).map((path) => (
                  <li className="flex min-w-0 items-center gap-1.5" key={path}>
                    <UiIcon
                      className="shrink-0 text-[var(--faint)]"
                      icon={FilePenLine}
                      size="xs"
                    />
                    <span className="truncate">{path}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {failedChanges.length > 0 ? (
            <p className="m-0 flex items-center gap-1.5 border-[var(--border)] border-t px-3 py-2 text-[length:var(--text-meta)] text-[var(--warn)]">
              <UiIcon icon={TriangleAlert} size="xs" />
              {failedChanges.length} failed file operation
              {failedChanges.length === 1 ? "" : "s"}
            </p>
          ) : null}
          {items.length > 1 ? (
            <ol className="m-0 grid max-h-52 list-none gap-0.5 overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    aria-pressed={selected?.id === item.id}
                    className={`grid min-h-8 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-[var(--radius-xs)] border-0 px-2 py-1 text-left transition-colors duration-100 hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)] motion-reduce:transition-none ${
                      selected?.id === item.id
                        ? "bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-soft))]"
                        : "bg-transparent"
                    }`}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <StatusMark status={item.status} />
                    <span className="flex min-w-0 items-baseline gap-2">
                      <strong className="shrink-0 text-[length:var(--text-meta)] font-semibold text-[var(--text-soft)]">
                        {item.label}
                      </strong>
                      <small className="truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                        {item.detail}
                      </small>
                    </span>
                    <time className="whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] max-[620px]:hidden">
                      {displayTimestamp(item.update.run.updatedAt)}
                    </time>
                    <UiIcon
                      className="text-[var(--faint)]"
                      icon={ChevronRight}
                      size="xs"
                    />
                  </button>
                </li>
              ))}
            </ol>
          ) : items.length === 0 ? (
            <p className="m-0 px-3 py-2.5 text-[length:var(--text-meta)] text-[var(--muted)]">
              {summary}
            </p>
          ) : null}
          {selected ? <RunDetail item={selected} /> : null}
          <footer className="flex min-w-0 items-center gap-2 border-[var(--border)] border-t px-3 py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)]">
            {state.tone === "bad" ? (
              <UiIcon
                className="text-[var(--bad)]"
                icon={TriangleAlert}
                size="xs"
              />
            ) : null}
            <span className="truncate">
              {receipt.latest.run.runDepth} · up to{" "}
              {receipt.latest.run.configuredMaxIterations} steps
            </span>
            <span className="ml-auto shrink-0">{state.statusLabel}</span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
