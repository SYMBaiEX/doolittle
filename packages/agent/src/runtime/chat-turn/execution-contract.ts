import type { ActionResult } from "@elizaos/core";
import {
  actionResultActionName,
  actionResultMutationActionName,
  extractVerifiedLocalMutationFromActionResult,
} from "@/runtime/action-result-metadata";
import { hasExplicitWorkspaceMutationIntent } from "@/runtime/workspace-mutation-intent";

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
  userRequest?: string;
}): TurnExecutionContract {
  return {
    requestedLocalMutation: hasExplicitWorkspaceMutationIntent(
      input.userRequest ?? "",
    ),
    selectedMutationActions: selectedLocalMutationActions(
      input.actionResults ?? [],
    ),
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

  return {
    ok: false,
    failureMessage:
      "I stopped before completing the requested workspace change. No verified local mutation receipt was recorded " +
      `(${[...new Set(missingReceipts)].join(", ")}), so this turn was not marked complete.`,
  };
}
