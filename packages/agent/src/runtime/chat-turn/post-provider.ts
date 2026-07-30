import { summarizeActionResults } from "@/runtime/action-result-metadata";
import {
  assessTurnExecutionContract,
  buildTurnExecutionContract,
} from "./execution-contract";
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
  const executionContract = buildTurnExecutionContract({
    actionResults: input.actionResults,
  });
  const activeRun = input.context.services.runController.getActive(
    input.turn.sessionId,
  );
  const actionResultSummary = summarizeActionResults(input.actionResults);
  const observedActionCount = Math.max(
    activeRun?.observedActionCount ?? 0,
    actionResultSummary.observedActionCount,
  );
  const executionAssessment = assessTurnExecutionContract({
    contract: executionContract,
    actionResults: input.actionResults,
    runFailureMessage: input.runFailureMessage,
  });
  const runFailureMessage = executionAssessment.ok
    ? input.runFailureMessage
    : executionAssessment.failureMessage;
  const response = executionAssessment.ok
    ? input.response
    : executionAssessment.failureMessage || input.response;

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

  return await finalizePostProviderTurn({
    context: input.context,
    turn: input.turn,
    finalResponse,
    runFailureMessage,
    observedActionCount,
    actionResults: input.actionResults,
    nativeResponseMessages: input.nativeResponseMessages,
    usedFallback: false,
    settingsDuring: input.settingsDuring,
    scheduleProfileObservation: input.scheduleProfileObservation,
  });
}
