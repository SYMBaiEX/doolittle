import type { ActionResult } from "@elizaos/core";
import {
  actionResultActionName,
  extractVerifiedLocalMutationFromActionResult,
} from "@/runtime/action-result-metadata";

// The ElizaOS executor records the selected action name on every ActionResult.
// Keep the local-mutation boundary explicit; prompt, command, and response text
// are not execution evidence.
const LOCAL_MUTATION_ACTIONS = new Set([
  "WRITE_FILE",
  "PATCH_FILE",
  "CREATE_DIRECTORY",
]);

export interface TurnExecutionContract {
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
    const actionName = actionResultActionName(result);
    return actionName && LOCAL_MUTATION_ACTIONS.has(actionName)
      ? [actionName]
      : [];
  });
}

export function buildTurnExecutionContract(input: {
  actionResults?: ActionResult[];
}): TurnExecutionContract {
  return {
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
  if (
    input.runFailureMessage ||
    input.contract.selectedMutationActions.length === 0
  ) {
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

  if (missingReceipts.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    failureMessage:
      "Native execution failed: a selected local mutation action did not produce a verified SDK action-result mutation receipt " +
      `(${missingReceipts.join(", ")}).`,
  };
}
