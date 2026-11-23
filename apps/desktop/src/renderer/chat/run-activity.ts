import type { RunToolActivity } from "@doolittle/contracts/run";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { toolActionLabel } from "../components/tool-activity-details";
import { fileName, type RunReceipt } from "./models";

export type ActivityStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled"
  | "waiting"
  | "unreported";

export interface RunActivityItem {
  id: string;
  label: string;
  detail: string;
  status: ActivityStatus;
  update: DesktopRunUpdate;
  activity?: RunToolActivity;
  durationMs?: number;
}

interface OpenAction {
  index: number;
  name: string;
  started: number;
  timingAvailable: boolean;
}

function actionName(update: DesktopRunUpdate): string {
  return (
    update.activity?.action ??
    ((update.type === "action-started"
      ? update.run.activeAction
      : update.run.lastAction) ||
      "")
  );
}

const activityStatuses: Record<RunToolActivity["phase"], ActivityStatus> = {
  queued: "queued",
  running: "running",
  completed: "complete",
  failed: "failed",
  cancelled: "cancelled",
};

const workerLabels: Record<string, string> = {
  read: "Reading file",
  search: "Searching files",
  edit: "Editing file",
  delete: "Removing file",
  move: "Moving file",
  execute: "Shell command",
  fetch: "Fetching resource",
};

function activityLabel(action: string, activity?: RunToolActivity): string {
  return (
    (activity?.origin === "delegated"
      ? workerLabels[activity.kind ?? ""] || "Worker step"
      : toolActionLabel(action)) || "Agent action"
  );
}

function activityTarget(activity?: RunToolActivity): string {
  if (!activity) return "";
  if (activity.command) return activity.command;
  const path = activity.paths?.[0];
  if (path) {
    const more = (activity.paths?.length ?? 0) - 1;
    return more > 0 ? `${fileName(path)} +${more}` : fileName(path);
  }
  return (
    activity.title || (activity.directory ? fileName(activity.directory) : "")
  );
}

function unsettled(status: ActivityStatus): boolean {
  return status === "queued" || status === "running";
}

export function lastMutation(run: DesktopRunUpdate["run"]) {
  return run.localMutations?.at(-1);
}

export function ended(update: DesktopRunUpdate): boolean {
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
  const observedReturns = new Set<string>();
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
    const { run, type, activity } = update;
    if (
      activity?.id &&
      (type === "action-started" ||
        type === "action-completed" ||
        type === "action-progress")
    ) {
      const id = `tool:${activity.id}`;
      const index = indexed.get(id);
      const previous = index === undefined ? undefined : items[index];
      const status = activityStatuses[activity.phase];
      if (
        previous &&
        ((unsettled(status) && !unsettled(previous.status)) ||
          (status === "queued" && previous.status === "running"))
      ) {
        continue;
      }
      const combined = { ...previous?.activity, ...activity };
      upsert({
        id,
        label: activityLabel(combined.action, combined),
        detail: activityTarget(combined),
        status,
        update,
        activity: combined,
        durationMs: combined.durationMs,
      });
    } else if (type === "action-started" || type === "action-completed") {
      const name = actionName(update);
      const id = `action:${run.observedActionCount}:${name}`;
      const timestamp = Date.parse(run.updatedAt);
      const label = activityLabel(name, activity);
      if (type === "action-started") {
        if (indexed.has(id)) continue;
        const timingAvailable = open.size === 0;
        for (const previous of open.values()) previous.timingAvailable = false;
        open.set(id, {
          index: upsert({
            id,
            label,
            detail: activityTarget(activity),
            status: activity ? activityStatuses[activity.phase] : "running",
            update,
            activity,
          }),
          name,
          started: timestamp,
          timingAvailable,
        });
      } else {
        const returnId = `return:${id}`;
        if (observedReturns.has(returnId)) continue;
        observedReturns.add(returnId);

        // The count is shared for the whole run and advances when any tool
        // starts, so a return can carry another invocation's count.
        const matches = name
          ? [...open].filter(([, action]) => action.name === name)
          : [];
        const match = matches.length === 1 ? matches[0] : undefined;
        if (matches.length > 1) {
          for (const [, { index }] of matches) {
            items[index] = { ...items[index], status: "unreported" };
          }
        }

        const elapsed = match ? timestamp - match[1].started : Number.NaN;
        const durationMs =
          match?.[1].timingAvailable && Number.isFinite(elapsed) && elapsed >= 0
            ? elapsed
            : undefined;
        const initial = match ? items[match[1].index].activity : undefined;
        const combined = activity ? { ...initial, ...activity } : initial;
        upsert({
          id: match?.[0] ?? returnId,
          label,
          detail:
            matches.length > 1
              ? "Invocation unknown"
              : activityTarget(combined),
          status: activity ? activityStatuses[activity.phase] : "complete",
          update,
          activity: combined,
          durationMs: activity?.durationMs ?? durationMs,
        });
        if (match) open.delete(match[0]);
      }
    } else if (type === "local-mutation") {
      const mutation = lastMutation(run);
      if (!mutation) continue;
      const path =
        mutation.resolvedPath || mutation.requestedPath || "Workspace";
      upsert({
        id: `mutation:${run.localMutations.length}:${mutation.recordedAt}`,
        label: mutation.success ? "Workspace changed" : "Change failed",
        detail: fileName(path),
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
    for (const [index, item] of items.entries()) {
      if (unsettled(item.status))
        items[index] = { ...item, status: "unreported" };
    }
  }
  return items;
}

export function formatCount(count: number, noun: string): string {
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
  if (run.status === "waiting") {
    return run.statusDetail === "Waiting for execution capacity"
      ? { label: "Queued", statusLabel: "queued", tone: "neutral" }
      : { label: "Waiting", statusLabel: "waiting", tone: "warn" };
  }
  if (run.status === "thinking")
    return { label: "Planning", statusLabel: "working", tone: "neutral" };
  return { label: "Working", statusLabel: "working", tone: "neutral" };
}

export function runElapsed(
  update: DesktopRunUpdate,
  now: number,
): number | undefined {
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
    (receipt.latest.run.status === "waiting" &&
      receipt.latest.run.statusDetail === "Waiting for execution capacity") ||
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
