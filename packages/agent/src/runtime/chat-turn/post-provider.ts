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
    loadDirectLocalIntent: input.loadDirectLocalIntent,
    approveDirectLocalIntent: input.approveDirectLocalIntent,
  });
  if (fallbackResult.kind === "approval") {
    return fallbackResult;
  }

  const finalResponse = buildPostProviderFinalResponse({
    effectiveInput: input.effectiveInput,
    response: fallbackResult.response,
    runFailureMessage: fallbackResult.runFailureMessage,
    observedActionCount: fallbackResult.observedActionCount,
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
    responseCacheKey: input.responseCacheKey,
    finalResponse,
    runFailureMessage: fallbackResult.runFailureMessage,
    observedActionCount: fallbackResult.observedActionCount,
    usedFallback: fallbackResult.usedFallback,
    scheduleProfileObservation: input.scheduleProfileObservation,
  });
}
