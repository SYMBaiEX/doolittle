import type { ActionResult } from "@elizaos/core";
import { actionResultActionName } from "@/runtime/action-result-metadata";
import {
  getScopedTurnActionResults,
  hasScopedTurnActionReceipts,
  resolveScopedTurnActionResult,
} from "@/runtime/turn-runtime-scope";
import { isRecord } from "@/utils/records";
import { chronologyUnverified } from "./workspace-evidence";

/** Merge Eliza's projected, settled, and Doolittle-scoped action receipts. */
export function mergeActionResults(
  runtime: object,
  ...groups: readonly (readonly ActionResult[])[]
): ActionResult[] {
  const merged: ActionResult[] = [];
  const seenObjects = new Set<ActionResult>();
  const seenReceipts = new Set<string>();
  const normalized = new Map<ActionResult, ActionResult>();
  const canonical = (result: ActionResult): ActionResult => {
    const existing = normalized.get(result);
    if (existing) return existing;
    const original = resolveScopedTurnActionResult(runtime, result);
    const action = actionResultActionName(result)?.toUpperCase();
    const value =
      original ??
      (hasScopedTurnActionReceipts(runtime) &&
      !chronologyUnverified(result) &&
      ["DOOLITTLE_APP_SERVER", "DOOLITTLE_BROWSER_ANALYZE"].includes(
        action ?? "",
      )
        ? {
            ...result,
            data: {
              ...result.data,
              doolittleReceiptChronologyUnverified: true,
            },
          }
        : result);
    normalized.set(result, value);
    return value;
  };
  const committed = new Set<ActionResult>();

  for (const [groupIndex, source] of groups.entries()) {
    const group = source.map(canonical);
    let insertionFloor = committed.size;
    for (const [index, result] of group.entries()) {
      if (seenObjects.has(result)) {
        insertionFloor = Math.max(insertionFloor, merged.indexOf(result) + 1);
        continue;
      }
      seenObjects.add(result);

      const action = actionResultActionName(result)?.toUpperCase();
      const data = result.data;
      let receiptKey: string | undefined;
      if (isRecord(data) && action === "TASKS_SPAWN_AGENT") {
        const delegated = data.delegatedExecution;
        const blocked = data.duplicateDelegationPrevented;
        if (isRecord(delegated) && typeof delegated.sessionId === "string") {
          receiptKey = `delegation:${delegated.sessionId}`;
        } else if (
          isRecord(blocked) &&
          typeof blocked.previousSessionId === "string"
        ) {
          receiptKey = `duplicate-delegation:${blocked.previousSessionId}`;
        }
      } else if (isRecord(data) && action === "SHELL") {
        if (typeof data.runId === "string") receiptKey = `shell:${data.runId}`;
      }

      // Distinct managed-server observations are chronological evidence, even
      // when the same session is ready twice. Collapsing session + status would
      // hide a post-correction readiness check and preserve a stale review.

      if (receiptKey && seenReceipts.has(receiptKey)) continue;
      if (receiptKey) seenReceipts.add(receiptKey);
      // SDK lists supply positions for legitimate SDK-only actions among new
      // scoped occurrences. Never backdate a new result ahead of committed
      // history merely because a reconstructed old wrapper appears after it.
      const next = group
        .slice(index + 1)
        .find(
          (candidate) =>
            !committed.has(candidate) &&
            merged.indexOf(candidate) >= insertionFloor,
        );
      const position = next ? merged.indexOf(next) : merged.length;
      merged.splice(position, 0, result);
      insertionFloor = position + 1;
    }
    if (groupIndex === 0) {
      for (const result of merged) committed.add(result);
    }
  }

  const hasDelegatedReceipt = merged.some((result) => {
    const data = result.data;
    return (
      actionResultActionName(result)?.toUpperCase() === "TASKS_SPAWN_AGENT" &&
      isRecord(data) &&
      isRecord(data.delegatedExecution)
    );
  });
  if (!hasDelegatedReceipt) return merged;

  return merged.filter((result) => {
    const data = result.data;
    return !(
      actionResultActionName(result)?.toUpperCase() === "TASKS_SPAWN_AGENT" &&
      isRecord(data) &&
      !isRecord(data.delegatedExecution) &&
      !isRecord(data.duplicateDelegationPrevented)
    );
  });
}

export function completedManagedAppServerSummary(
  actionResults: readonly ActionResult[],
): string | undefined {
  const observedSessions = new Set<string>();
  const result = [...actionResults].reverse().find((candidate) => {
    if (actionResultActionName(candidate) !== "DOOLITTLE_APP_SERVER")
      return false;
    const data = candidate.data;
    const session = isRecord(data?.session) ? data.session : undefined;
    if (typeof session?.id === "string") {
      if (observedSessions.has(session.id)) return false;
      // A later stop or unhealthy observation invalidates earlier readiness,
      // including when the status action itself failed.
      observedSessions.add(session.id);
    }
    return (
      candidate.success === true &&
      !chronologyUnverified(candidate) &&
      actionResultActionName(candidate) === "DOOLITTLE_APP_SERVER" &&
      isRecord(data) &&
      data.status === "ready" &&
      typeof data.url === "string" &&
      isRecord(data.session)
    );
  });
  if (!result || !isRecord(result.data) || !isRecord(result.data.session)) {
    return undefined;
  }

  const data = result.data;
  const sessionValue = data.session;
  if (!isRecord(sessionValue)) return undefined;
  const url = data.url;
  if (typeof url !== "string") return undefined;
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const session = sessionValue;
  const details = [
    typeof session.cwd === "string" ? session.cwd : undefined,
    typeof session.command === "string" ? `\`${session.command}\`` : undefined,
  ].filter((value): value is string => Boolean(value));
  const sessionId =
    typeof session.id === "string" ? session.id.trim() : undefined;
  return [
    `Managed application ready at ${url}${details.length ? ` (${details.join(" · ")})` : ""}.`,
    sessionId
      ? `Stop it from the workspace Terminal or with DOOLITTLE_APP_SERVER operation=stop and sessionId=${sessionId}.`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The beta SDK can throw while asking the parent model to continue after an
 * awaited coding child has already ended successfully. That continuation is
 * presentation work, not execution authority. Recover only Doolittle's own
 * receipt-backed managed delegation result; ordinary tool successes still
 * require the SDK to produce a canonical terminal response.
 */
export function completedManagedDelegationResponse(
  actionResults: readonly ActionResult[],
): string | undefined {
  const result = [...actionResults].reverse().find((candidate) => {
    if (
      candidate.success !== true ||
      actionResultActionName(candidate) !== "TASKS_SPAWN_AGENT" ||
      !isRecord(candidate.data?.delegatedExecution)
    ) {
      return false;
    }
    const receipt = candidate.data.delegatedExecution;
    return receipt.status === "completed" && receipt.stopReason === "end_turn";
  });
  if (!result || actionResultActionName(result) !== "TASKS_SPAWN_AGENT") {
    return undefined;
  }
  const delegatedExecution = result.data?.delegatedExecution;
  if (!delegatedExecution || typeof delegatedExecution !== "object") {
    return undefined;
  }
  const receipt = delegatedExecution as Record<string, unknown>;
  const exitCode = receipt.exitCode;
  if (
    receipt.status !== "completed" ||
    receipt.stopReason !== "end_turn" ||
    (exitCode !== null && exitCode !== 0)
  ) {
    return undefined;
  }
  return typeof result.text === "string" && result.text.trim()
    ? result.text.trim()
    : undefined;
}

export function managedDelegationFailure(
  actionResults: readonly ActionResult[],
): { result: ActionResult; message: string } | undefined {
  const result = [...actionResults]
    .reverse()
    .find(
      (candidate) => actionResultActionName(candidate) === "TASKS_SPAWN_AGENT",
    );
  if (result?.success !== false || !isRecord(result?.data)) return undefined;
  const receipt = result.data.delegatedExecution;
  if (
    !isRecord(receipt) ||
    !["failed", "cancelled"].includes(String(receipt.status))
  )
    return undefined;
  const message =
    (typeof result.data.userFacingText === "string" &&
      result.data.userFacingText.trim()) ||
    (typeof receipt.failureMessage === "string" &&
      receipt.failureMessage.trim()) ||
    (typeof result.text === "string" && result.text.trim()) ||
    "The coding agent stopped before completing the task. Review its activity and retry after resolving the reported issue.";
  return { result, message };
}

/**
 * Recover scoped receipts once, in order, for both settled and failed turns.
 * The merge includes full scoped originals; post-merge backfills are redundant
 * and must not append an older readiness observation after a later stop.
 */
export function collectProviderActionResults(
  runtime: object,
  previous: readonly ActionResult[],
  ...observations: readonly (readonly ActionResult[])[]
): ActionResult[] {
  return mergeActionResults(
    runtime,
    previous,
    getScopedTurnActionResults(runtime),
    ...observations,
  );
}
