import { createHash } from "node:crypto";
import type { ActionResult } from "@elizaos/core";
import { isRecord } from "../../utils/records";
import { inspectWorkspaceCommands } from "../../utils/workspace-commands";
import {
  actionResultActionName,
  extractCommandResultFromActionResult,
  extractLocalMutationsFromActionResult,
} from "../action-result-metadata";

export type ContinuationPassEvidence = {
  actionCount: number;
  mutationEvidenceCount: number;
  workspaceOperationEvidenceCount: number;
  /**
   * Present only when every action in this pass is observably non-progress:
   * an explicit failure (or a failed terminal command) with no successful
   * mutation evidence. Unknown, successful, or partially mutating actions are
   * uncertainty and deliberately reset repetition tracking instead.
   */
  noProgressFingerprint?: string;
};

const WORKSPACE_EVIDENCE_KINDS = new Set([
  "install",
  "build",
  "bundle",
  "verification",
]);

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
}

function stableErrorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return normalizedText(error);
  if (isRecord(error) && typeof error.message === "string") {
    return normalizedText(error.message);
  }
  return "";
}

function resultText(result: ActionResult): string {
  return normalizedText(
    typeof result.userFacingText === "string" && result.userFacingText.trim()
      ? result.userFacingText
      : result.text,
  );
}

function mutationEvidence(result: ActionResult) {
  return extractLocalMutationsFromActionResult(result).map((mutation) => ({
    action: mutation.action,
    requestedPath: mutation.requestedPath ?? null,
    resolvedPath: mutation.resolvedPath ?? null,
    success: mutation.success,
    message: mutation.message ?? null,
    bytes: mutation.bytes ?? null,
    replacements: mutation.replacements ?? null,
  }));
}

function commandReceiptDetails(result: ActionResult): {
  hasCapturedOutput: boolean;
  timedOut: boolean | null;
  truncated: boolean | null;
} {
  const data = result.data;
  if (!isRecord(data)) {
    return { hasCapturedOutput: false, timedOut: null, truncated: null };
  }
  const source = isRecord(data.commandResult) ? data.commandResult : data;
  return {
    hasCapturedOutput:
      typeof source.stdout === "string" && typeof source.stderr === "string",
    timedOut: typeof source.timedOut === "boolean" ? source.timedOut : null,
    truncated: typeof source.truncated === "boolean" ? source.truncated : null,
  };
}

function successfulWorkspaceOperationCount(result: ActionResult): number {
  const command = extractCommandResultFromActionResult(result);
  if (
    !command ||
    result.success === false ||
    command.success !== true ||
    command.exitCode !== 0
  ) {
    return 0;
  }
  return inspectWorkspaceCommands(command.command, command.executedIn).filter(
    (operation) => WORKSPACE_EVIDENCE_KINDS.has(operation.kind),
  ).length;
}

/**
 * Returns a content fingerprint only for outcomes the receipts prove did not
 * make semantic progress. A missing fingerprint means "uncertain or progress",
 * never "no progress"; callers must treat it as a reset and continue normally.
 */
function nonProgressActionFingerprintPart(
  result: ActionResult,
): Record<string, unknown> | undefined {
  const actionName = actionResultActionName(result) ?? null;
  const command = extractCommandResultFromActionResult(result);
  if (command) {
    const failedCommand =
      result.success === false ||
      command.success !== true ||
      command.exitCode !== 0;
    if (!failedCommand) return undefined;
    const receiptDetails = commandReceiptDetails(result);
    return {
      kind: "command",
      actionName,
      command: normalizedText(command.command),
      executedIn: command.executedIn ?? null,
      exitCode: command.exitCode,
      commandSuccess: command.success,
      resultSuccess: result.success ?? null,
      stdout: normalizedText(command.stdout),
      stderr: normalizedText(command.stderr),
      timedOut: receiptDetails.timedOut,
      truncated: receiptDetails.truncated,
      // Terminal envelopes commonly embed fresh attachment/run identities in
      // their display text. When structured stdout/stderr exists, those
      // identity strings are transport noise rather than semantic outcome.
      // Without captured output, retain text as the only failure-detail evidence.
      ...(receiptDetails.hasCapturedOutput ? {} : { text: resultText(result) }),
      error: stableErrorText(result.error),
    };
  }

  const mutations = mutationEvidence(result);
  // Failed or cancelled delegated work can still leave fingerprint-verified
  // file changes. Those changes are semantic progress even when the action's
  // overall status is a failure, so they must never join a no-progress pair.
  if (mutations.some((mutation) => mutation.success)) return undefined;
  if (result.success !== false) return undefined;

  return {
    kind: "action",
    actionName,
    resultSuccess: result.success,
    text: resultText(result),
    error: stableErrorText(result.error),
    mutations,
  };
}

export function continuationPassEvidence(
  actionResults: readonly ActionResult[],
): ContinuationPassEvidence {
  let mutationEvidenceCount = 0;
  let workspaceOperationEvidenceCount = 0;
  let allActionsNonProgress = actionResults.length > 0;
  const fingerprintParts: Record<string, unknown>[] = [];

  for (const result of actionResults) {
    const mutations = extractLocalMutationsFromActionResult(result);
    mutationEvidenceCount += mutations.filter(
      (mutation) => mutation.success,
    ).length;
    workspaceOperationEvidenceCount +=
      successfulWorkspaceOperationCount(result);

    const part = nonProgressActionFingerprintPart(result);
    if (!part) {
      allActionsNonProgress = false;
    } else {
      fingerprintParts.push(part);
    }
  }

  return {
    actionCount: actionResults.length,
    mutationEvidenceCount,
    workspaceOperationEvidenceCount,
    ...(allActionsNonProgress
      ? {
          noProgressFingerprint: createHash("sha256")
            .update(JSON.stringify({ version: 1, fingerprintParts }))
            .digest("hex"),
        }
      : {}),
  };
}
