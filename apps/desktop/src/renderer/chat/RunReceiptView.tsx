import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  FilePenLine,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import { displayTimestamp } from "../lib";
import { type RunReceipt, runEventCopy, runEventKey } from "./models";

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
}: {
  pending: boolean;
  receipt: RunReceipt;
}) {
  const state = runReceiptState(receipt);
  const items = useMemo(() => runActivityItems(receipt), [receipt]);
  const [expanded, setExpanded] = useState(pending || state.tone === "bad");
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
  const completed = items.filter((item) => item.status === "complete").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const running = items.filter((item) => item.status === "running").length;
  const elapsed = formatRunElapsed(elapsedMilliseconds(receipt.latest, clock));
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

  return (
    <section
      aria-live={pending ? "polite" : undefined}
      className={`chat-run-receipt mb-2 overflow-hidden rounded-[var(--radius-sm)] border whitespace-normal shadow-[0_8px_24px_color-mix(in_srgb,var(--shadow)_10%,transparent)] ${
        state.tone === "bad"
          ? "border-[color-mix(in_srgb,var(--bad)_38%,var(--border))]"
          : pending
            ? "border-[color-mix(in_srgb,var(--accent)_38%,var(--border))]"
            : "border-[color-mix(in_srgb,var(--border)_76%,transparent)]"
      } bg-[color-mix(in_srgb,var(--surface-raised)_88%,var(--bg))]`}
      data-pending={pending ? "true" : "false"}
    >
      <button
        aria-expanded={expanded}
        className="grid min-h-11 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="grid size-6 place-items-center rounded-[6px] border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] text-[var(--accent)]">
          <UiIcon icon={Bot} size="sm" />
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <strong className="shrink-0 text-[length:var(--text-control)] font-semibold text-[var(--text)]">
            Doolittle
          </strong>
          <small className="truncate text-[length:var(--text-meta)] text-[var(--muted)]">
            {state.label}
            {running + completed + failed > 0 ? " · " : null}
            {running > 0 ? `${running} running` : null}
            {running > 0 && (completed > 0 || failed > 0) ? " · " : null}
            {completed > 0 ? `${completed} done` : null}
            {completed > 0 && failed > 0 ? " · " : null}
            {failed > 0 ? `${failed} failed` : null}
          </small>
        </span>
        <span className="whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)] max-[520px]:hidden">
          {receipt.latest.run.observedActionCount} actions · {elapsed}
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
      {!expanded ? (
        <div className="flex min-w-0 items-center gap-2 border-[var(--border)] border-t px-3 py-1.5">
          <CircleDot
            aria-hidden="true"
            className={`size-2.5 shrink-0 ${
              state.tone === "good"
                ? "text-[var(--good)]"
                : state.tone === "bad"
                  ? "text-[var(--bad)]"
                  : state.tone === "warn"
                    ? "text-[var(--warn)]"
                    : "text-[var(--accent)]"
            }`}
          />
          <span className="truncate text-[length:var(--text-meta)] text-[var(--muted)]">
            {summary}
          </span>
        </div>
      ) : null}
      {expanded ? (
        <div className="border-[var(--border)] border-t">
          {items.length > 0 ? (
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
          ) : (
            <p className="m-0 px-3 py-2.5 text-[length:var(--text-meta)] text-[var(--muted)]">
              {summary}
            </p>
          )}
          {selected ? <RunDetail item={selected} /> : null}
          <footer className="flex min-w-0 items-center gap-2 border-[var(--border)] border-t px-3 py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--faint)]">
            {state.tone === "bad" ? (
              <UiIcon
                className="text-[var(--bad)]"
                icon={TriangleAlert}
                size="xs"
              />
            ) : null}
            <span className="truncate">{summary}</span>
            <span className="ml-auto shrink-0">{state.statusLabel}</span>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
