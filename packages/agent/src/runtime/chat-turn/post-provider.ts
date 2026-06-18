import { summarizeActionResults } from "@/runtime/action-result-metadata";
import {
  assessTurnExecutionContract,
  buildTurnExecutionContract,
} from "./execution-contract";
import { resolvePostProviderFallback } from "./post-provider/fallback";
import {
  buildPostProviderFinalResponse,
  emitPostProviderNotices,
  finalizePostProviderTurn,
} from "./post-provider/finalize";
import type {
  PostProviderTurnInput,
  PostProviderTurnResult,
} from "./post-provider/types";

export async function runPostProviderTurn(
  input: PostProviderTurnInput,
): Promise<PostProviderTurnResult> {
  const fallbackResult = await resolvePostProviderFallback({
    context: input.context,
    effectiveInput: input.effectiveInput,
    turn: input.turn,
    options: input.options,
    response: input.response,
    runFailureMessage: input.runFailureMessage,
    actionResults: input.actionResults,
    loadDirectLocalIntent: input.loadDirectLocalIntent,
    approveDirectLocalIntent: input.approveDirectLocalIntent,
  });
  if (fallbackResult.kind === "approval") {
    return fallbackResult;
  }

  const executionContract = buildTurnExecutionContract({
    message: input.effectiveInput.message,
    localInteractive: input.turn.localInteractive,
  });
  const activeRun = input.context.services.runController.getActive(
    input.turn.sessionId,
  );
  const actionResultSummary = summarizeActionResults(input.actionResults);
  const observedActionCount = Math.max(
    fallbackResult.observedActionCount,
    actionResultSummary.observedActionCount,
  );
  const executionAssessment = assessTurnExecutionContract({
    contract: executionContract,
    response: fallbackResult.response,
    observedActionCount,
    actionResults: input.actionResults,
    localMutations: activeRun?.localMutations,
    commandResults: actionResultSummary.commandResults,
    runFailureMessage: fallbackResult.runFailureMessage,
  });
  const runFailureMessage = executionAssessment.ok
    ? fallbackResult.runFailureMessage
    : executionAssessment.failureMessage;
  const response = executionAssessment.ok
    ? fallbackResult.response
    : executionAssessment.failureMessage || fallbackResult.response;

  const finalResponse = buildPostProviderFinalResponse({
    effectiveInput: input.effectiveInput,
    response,
    runFailureMessage,
    observedActionCount,
    settingsDuring: input.settingsDuring,
  });

  await emitPostProviderNotices({
    input: input.input,
    context: input.context,
    options: input.options,
    turn: input.turn,
  });

  return finalizePostProviderTurn({
    context: input.context,
    turn: input.turn,
    finalResponse,
    runFailureMessage,
    observedActionCount,
    actionResults: input.actionResults,
    usedFallback: fallbackResult.usedFallback,
    settingsDuring: input.settingsDuring,
    scheduleProfileObservation: input.scheduleProfileObservation,
  });
}
