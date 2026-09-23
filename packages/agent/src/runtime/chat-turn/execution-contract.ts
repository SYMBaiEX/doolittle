import type { ActionResult } from "@elizaos/core";
import {
  actionResultActionName,
  actionResultMutationActionName,
  extractVerifiedLocalMutationFromActionResult,
} from "@/runtime/action-result-metadata";
import { hasWorkspaceMutationObligation } from "@/runtime/workspace-mutation-intent";
import {
  verifyWorkspaceNoopCompletion,
  type WorkspaceNoopRequirements,
  workspaceNoopRequirements,
} from "./workspace-noop-completion";

// The ElizaOS executor records the selected action name on every ActionResult.
// Keep the local-mutation boundary explicit; prompt, command, and response text
// are not execution evidence.
const LOCAL_MUTATION_ACTIONS = new Set([
  "WRITE_FILE",
  "PATCH_FILE",
  "CREATE_DIRECTORY",
]);

export interface TurnExecutionContract {
  requestedLocalMutation: boolean;
  selectedMutationActions: string[];
  noOpRequirements?: WorkspaceNoopRequirements;
}

export interface TurnExecutionAssessment {
  ok: boolean;
  failureMessage?: string;
}

function selectedLocalMutationActions(
  actionResults: readonly ActionResult[],
): string[] {
  return actionResults.flatMap((result) => {
    // Arm only from receipt-grade evidence. Both the obligation and its
    // discharge must come from the same `mutation` envelope, otherwise the
    // contract can be armed by a result that could never satisfy it.
    const actionName = actionResultMutationActionName(result);
    return actionName && LOCAL_MUTATION_ACTIONS.has(actionName)
      ? [actionName]
      : [];
  });
}

function observedSuccessfulLocalMutationAction(
  actionResults: readonly ActionResult[],
): boolean {
  return actionResults.some((result) => {
    const actionName = actionResultActionName(result);
    return (
      result.success === true &&
      typeof actionName === "string" &&
      LOCAL_MUTATION_ACTIONS.has(actionName)
    );
  });
}

export function buildTurnExecutionContract(input: {
  actionResults?: ActionResult[];
  recentMessages?: Array<{ role?: string; text?: string }>;
  userRequest?: string;
}): TurnExecutionContract {
  return {
    requestedLocalMutation: hasWorkspaceMutationObligation(
      input.userRequest ?? "",
      input.recentMessages,
    ),
    selectedMutationActions: selectedLocalMutationActions(
      input.actionResults ?? [],
    ),
    noOpRequirements: workspaceNoopRequirements(input.userRequest ?? ""),
  };
}

export function assessTurnExecutionContract(input: {
  contract: TurnExecutionContract;
  actionResults?: ActionResult[];
  runFailureMessage?: string;
}): TurnExecutionAssessment {
  if (input.runFailureMessage) {
    return { ok: true };
  }

  // A failed coding session can have changed files before hitting a genuine
  // blocker. Preserve the adapter's verified, user-facing failure instead of
  // either declaring success from that mutation or hiding the cause behind the
  // generic missing-receipt message. Earlier failures may have been recovered;
  // only the final observed action is authoritative here.
  const lastResult = input.actionResults?.at(-1);
  const delegatedExecution = lastResult?.data?.delegatedExecution;
  if (
    lastResult?.success === false &&
    lastResult.verifiedUserFacing === true &&
    typeof lastResult.userFacingText === "string" &&
    lastResult.userFacingText.trim() &&
    delegatedExecution &&
    typeof delegatedExecution === "object" &&
    "status" in delegatedExecution &&
    (delegatedExecution.status === "failed" ||
      delegatedExecution.status === "cancelled")
  ) {
    return { ok: false, failureMessage: lastResult.userFacingText.trim() };
  }

  const successfulReceipts = new Set(
    (input.actionResults ?? []).flatMap((actionResult) => {
      const mutation =
        extractVerifiedLocalMutationFromActionResult(actionResult);
      return mutation?.success ? [mutation.action] : [];
    }),
  );
  const missingReceipts = input.contract.selectedMutationActions.filter(
    (actionName) => !successfulReceipts.has(actionName),
  );

  if (
    input.contract.requestedLocalMutation &&
    successfulReceipts.size === 0 &&
    !observedSuccessfulLocalMutationAction(input.actionResults ?? [])
  ) {
    missingReceipts.unshift("REQUESTED_LOCAL_MUTATION");
  }

  if (missingReceipts.length === 0) {
    return { ok: true };
  }

  // A verified no-op is a satisfied request, not an unrecorded mutation. Keep
  // the exception narrow: the coding delegate must explicitly attest that the
  // exact workspace already meets the request, and independent Bun/build,
  // managed-server, and HTTP receipts must all agree on that directory.
  if (
    input.contract.requestedLocalMutation &&
    input.contract.selectedMutationActions.length === 0 &&
    successfulReceipts.size === 0 &&
    !observedSuccessfulLocalMutationAction(input.actionResults ?? []) &&
    verifyWorkspaceNoopCompletion(
      input.actionResults ?? [],
      input.contract.noOpRequirements,
    )
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    failureMessage:
      "I stopped before completing the requested workspace change. No verified local mutation receipt was recorded " +
      `(${[...new Set(missingReceipts)].join(", ")}), so this turn was not marked complete.`,
  };
}
