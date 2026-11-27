import { isTerminalRunStatus } from "@doolittle/contracts/run";
import type { RunReceipt } from "./models";
import { formatCount, formatRunElapsed } from "./run-activity";

/**
 * Evidence-only aggregate for one settled assistant turn. The terminal run
 * snapshot is the source of truth: replayed activity events can be truncated,
 * while the snapshot retains the observed action count, mutations, and timing.
 */
export interface TurnActivitySummary {
  toolCallCount: number;
  changedFileCount: number;
  durationMs?: number;
}

function settled(run: RunReceipt["latest"]["run"]): boolean {
  return Boolean(
    run.endedAt || run.terminalReason || isTerminalRunStatus(run.status),
  );
}

function successfulMutationPaths(
  run: RunReceipt["latest"]["run"],
): Set<string> {
  const paths = new Set<string>();
  for (const mutation of run.localMutations as unknown[]) {
    if (!mutation || typeof mutation !== "object" || Array.isArray(mutation))
      continue;
    const record = mutation as {
      success?: unknown;
      resolvedPath?: unknown;
      requestedPath?: unknown;
    };
    if (record.success !== true) continue;
    const resolvedPath =
      typeof record.resolvedPath === "string" && record.resolvedPath
        ? record.resolvedPath
        : undefined;
    const requestedPath =
      typeof record.requestedPath === "string" && record.requestedPath
        ? record.requestedPath
        : undefined;
    const path = resolvedPath ?? requestedPath;
    if (path) paths.add(path);
  }
  return paths;
}

function terminalDurationMs(
  run: RunReceipt["latest"]["run"],
): number | undefined {
  const startedAtMs = Date.parse(run.startedAt);
  // Legacy terminal receipts predate endedAt; their terminal updatedAt is the
  // end evidence. Post-terminal updates are not part of a run receipt.
  const endedAtMs = Date.parse(run.endedAt ?? run.updatedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs))
    return undefined;
  const duration = endedAtMs - startedAtMs;
  return duration > 0 ? duration : undefined;
}

/** Return null whenever the receipt is missing, active, or has no honest segments. */
export function deriveTurnActivitySummary(
  receipt: RunReceipt | undefined,
): TurnActivitySummary | null {
  if (!receipt) return null;
  const { run } = receipt.latest;
  if (!settled(run)) return null;
  const toolCallCount =
    typeof run.observedActionCount === "number" &&
    Number.isSafeInteger(run.observedActionCount) &&
    run.observedActionCount > 0
      ? run.observedActionCount
      : 0;
  const changedFileCount = successfulMutationPaths(run).size;
  const durationMs = terminalDurationMs(run);
  if (!toolCallCount && !changedFileCount && durationMs === undefined)
    return null;
  return { toolCallCount, changedFileCount, durationMs };
}

/** Compact muted-transcript label; zero and unknown segments stay absent. */
export function formatTurnActivitySummary(
  summary: TurnActivitySummary,
): string {
  const segments: string[] = [];
  if (summary.toolCallCount > 0)
    segments.push(formatCount(summary.toolCallCount, "tool call"));
  if (summary.changedFileCount > 0)
    segments.push(`${formatCount(summary.changedFileCount, "file")} changed`);
  if (summary.durationMs !== undefined && summary.durationMs > 0)
    segments.push(formatRunElapsed(summary.durationMs));
  return segments.join(" · ");
}
