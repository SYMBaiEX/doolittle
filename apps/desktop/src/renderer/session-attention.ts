import { isActiveRunStatus } from "@doolittle/contracts/run";
import { asRecordOrUndefined } from "@elizaos/shared/type-guards";
import type { RunReceiptStore } from "./chat/models";

/**
 * Per-session attention vocabulary for history rows. The derivation is pure
 * and evidence-only: volatile run state owned by the chat workspace store and
 * already-polled approval/input-request caches. It never infers liveness from
 * transport health and never fabricates a status for unknown sessions.
 */
export type SessionAttentionKind = "needs-input" | "working" | "idle";

export interface SessionAttention {
  kind: SessionAttentionKind;
  /** Operator-facing state label; empty when the row stays quiet. */
  label: string;
}

export interface SessionRunRollup {
  active: boolean;
  pendingApprovals: number;
}

const IDLE_ATTENTION: SessionAttention = { kind: "idle", label: "" };

function runSettled(run: {
  status: string;
  endedAt?: string;
  terminalReason?: string;
}): boolean {
  return (
    !isActiveRunStatus(run.status) || Boolean(run.endedAt || run.terminalReason)
  );
}

/**
 * Fold volatile run state into one lookup per session. `run.active-requests`
 * covers the dispatch-to-first-event gap; receipts cover hydration and every
 * subsequent lifecycle event. A terminal receipt always outranks a stale
 * active-request entry so rows settle instead of flickering.
 */
export function rollupSessionRuns(
  activeRequests: Readonly<Record<string, string>>,
  receipts: RunReceiptStore,
): ReadonlyMap<string, SessionRunRollup> {
  const rollup = new Map<string, SessionRunRollup>();
  const entry = (sessionId: string): SessionRunRollup => {
    const existing = rollup.get(sessionId);
    if (existing) return existing;
    const created: SessionRunRollup = { active: false, pendingApprovals: 0 };
    rollup.set(sessionId, created);
    return created;
  };

  for (const [sessionId, runId] of Object.entries(activeRequests)) {
    const receipt = receipts[runId];
    if (receipt) {
      const run = receipt.latest.run;
      if (runSettled(run)) continue;
    }
    entry(sessionId).active = true;
  }

  for (const receipt of Object.values(receipts)) {
    const run = receipt.latest.run;
    if (runSettled(run)) continue;
    const sessionId = receipt.latest.sessionId || run.sessionId;
    if (!sessionId) continue;
    const target = entry(sessionId);
    target.active = true;
    if (run.pendingApprovals > 0)
      target.pendingApprovals += run.pendingApprovals;
  }

  return rollup;
}

/**
 * Attention wins over working: a run blocked on the operator is both active
 * and waiting, and the operator cares about the input first.
 */
export function deriveSessionAttention({
  runActivity,
  pendingInputs,
}: {
  runActivity?: SessionRunRollup;
  pendingInputs: number;
}): SessionAttention {
  if (pendingInputs > 0 || (runActivity?.pendingApprovals ?? 0) > 0)
    return { kind: "needs-input", label: "Needs input" };
  if (runActivity?.active) return { kind: "working", label: "Working" };
  return IDLE_ATTENTION;
}

const APPROVAL_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u;

/**
 * Project already-cached approval/input-request list payloads into per-session
 * pending counts. Records mirror the composer panels' exact room scope: a
 * sessionKey scoped elsewhere never counts toward the row. Entries are deduped
 * by identity because app-level and bot-scoped polls can hold the same record.
 */
export function pendingInputsBySession(
  payloads: readonly unknown[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const payload of payloads) {
    const record = asRecordOrUndefined(payload);
    if (!record) continue;
    for (const key of ["approvals", "requests"] as const) {
      const list = record[key];
      if (!Array.isArray(list)) continue;
      for (const value of list) {
        const item = asRecordOrUndefined(value);
        if (item?.status !== "pending") continue;
        if (typeof item.id !== "string" || item.id.length > 256) continue;
        if (!APPROVAL_ID_PATTERN.test(item.id)) continue;
        if (typeof item.roomId !== "string" || !item.roomId) continue;
        if (item.sessionKey !== undefined && item.sessionKey !== item.roomId)
          continue;
        const identity = `${key}:${item.id}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        counts.set(item.roomId, (counts.get(item.roomId) ?? 0) + 1);
      }
    }
  }
  return counts;
}
