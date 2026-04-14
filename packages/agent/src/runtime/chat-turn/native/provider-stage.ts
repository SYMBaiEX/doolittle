import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { getProviderReadinessMessage } from "@/runtime/linked-provider-accounts";
import type { ChatTurnRequest } from "@/types/runtime";
import { readInformationalResponseCache } from "../cache";
import { buildPreferredLocalIntentSynthesisPrelude } from "../local-intent-orchestration/synthesis";
import type { DirectLocalIntentLoader } from "../local-intent-orchestration/types";
import { createModelInputAssembly } from "../model-input";
import { runPostProviderTurn } from "../post-provider";
import { runProviderModelTurn } from "../provider";
import {
  handleCachedInformationalTurn,
  handleReadyResponseTurn,
} from "./shortcuts";
import type { NativeTurnSetup, SettingsSnapshot, TurnPerfTrace } from "./types";

type NativeTurnOptions = AgentTurnHooks & {
  personalityId?: string;
};

export interface NativeProviderStageInput {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  options?: NativeTurnOptions;
  perf: TurnPerfTrace;
  turnSetup: NativeTurnSetup;
  settingsDuring: SettingsSnapshot;
  loadDirectLocalIntent: () => Promise<DirectLocalIntentLoader>;
  preferredLocalIntent: DirectLocalIntentLoader | null;
  approveDirectLocalIntent: (
    intent: { label?: string },
    pendingNotice?: string,
  ) => Promise<string | undefined>;
}

export interface NativeProviderStageDependencies {
  createModelInputAssembly: typeof createModelInputAssembly;
  readInformationalResponseCache: typeof readInformationalResponseCache;
  handleCachedInformationalTurn: typeof handleCachedInformationalTurn;
  buildPreferredLocalIntentSynthesisPrelude: typeof buildPreferredLocalIntentSynthesisPrelude;
  getProviderReadinessMessage: typeof getProviderReadinessMessage;
  handleReadyResponseTurn: typeof handleReadyResponseTurn;
  runProviderModelTurn: typeof runProviderModelTurn;
  runPostProviderTurn: typeof runPostProviderTurn;
}

const defaultDependencies: NativeProviderStageDependencies = {
  createModelInputAssembly,
  readInformationalResponseCache,
  handleCachedInformationalTurn,
  buildPreferredLocalIntentSynthesisPrelude,
  getProviderReadinessMessage,
  handleReadyResponseTurn,
  runProviderModelTurn,
  runPostProviderTurn,
};

export async function runNativeProviderStage(
  input: NativeProviderStageInput,
  dependencies: NativeProviderStageDependencies = defaultDependencies,
): Promise<string> {
  const turn = input.turnSetup.turn;
  const scheduleProfileObservation = input.turnSetup.scheduleProfileObservation;
  const derivedTurnPolicy = input.turnSetup.derivedTurnPolicy;
  const settingsBefore = input.turnSetup.settingsBefore;
  const turnClassification = input.turnSetup.turnClassification;
  const responseSource = input.input.source ?? "cli";

  const modelInputAssembly = dependencies.createModelInputAssembly({
    context: input.context,
    turn,
    effectiveInput: input.effectiveInput,
    derivedTurnPolicy,
    turnClassification,
    settingsDuring: input.settingsDuring,
    options: input.options,
    preferredLocalIntent: input.preferredLocalIntent,
  });

  const responseCacheKey = modelInputAssembly.responseCacheKey;
  const cachedResponse = await dependencies.handleCachedInformationalTurn({
    context: input.context,
    turn,
    cachedResponse: responseCacheKey
      ? dependencies.readInformationalResponseCache(responseCacheKey)
      : undefined,
    scheduleProfileObservation,
    options: input.options,
    perf: input.perf,
    source: input.input.source,
  });
  if (cachedResponse) {
    return cachedResponse;
  }

  let localSynthesisPrelude: string | undefined;
  if (modelInputAssembly.requiresPreferredLocalIntentSynthesis) {
    const synthesisResult =
      await dependencies.buildPreferredLocalIntentSynthesisPrelude({
        input: input.input,
        context: input.context,
        options: input.options,
        turn,
        preferredLocalIntent: input.preferredLocalIntent,
      });
    if (synthesisResult.kind === "approval") {
      return synthesisResult.response;
    }
    localSynthesisPrelude = synthesisResult.localSynthesisPrelude;
  }

  const { effectiveMessage } = modelInputAssembly.build(localSynthesisPrelude);
  const readinessMessage = await dependencies.getProviderReadinessMessage(
    input.context,
    input.settingsDuring.model.provider,
  );
  input.perf.mark("provider-readiness");
  const readyResponse = await dependencies.handleReadyResponseTurn({
    context: input.context,
    turn,
    readinessMessage,
    scheduleProfileObservation,
    options: input.options,
    perf: input.perf,
    source: input.input.source,
  });
  if (readyResponse) {
    return readyResponse;
  }

  const providerResult = await dependencies.runProviderModelTurn({
    context: input.context,
    turn,
    effectiveMessage,
    settingsBefore,
    settingsDuring: input.settingsDuring,
    capabilityProfile: modelInputAssembly.capabilityProfile,
    derivedTurnPolicy,
    options: input.options,
    loadDirectLocalIntent: input.loadDirectLocalIntent,
  });
  if (providerResult.handledMessage) {
    input.perf.mark("native-handle-message");
  }

  const postProviderResult = await dependencies.runPostProviderTurn({
    input: input.input,
    effectiveInput: input.effectiveInput,
    context: input.context,
    options: input.options,
    turn,
    response: providerResult.response,
    runFailureMessage: providerResult.runFailureMessage,
    settingsDuring: input.settingsDuring,
    responseCacheKey,
    scheduleProfileObservation,
    loadDirectLocalIntent: input.loadDirectLocalIntent,
    approveDirectLocalIntent: input.approveDirectLocalIntent,
  });
  if (postProviderResult.kind === "approval") {
    return postProviderResult.response;
  }

  if (postProviderResult.usedFallback) {
    input.perf.mark("fallback-local-intent");
  }
  input.perf.mark("post-response");
  input.perf.flush(input.context.runtime.logger, {
    path: postProviderResult.runFailureMessage
      ? "native-error"
      : "native-response",
    sessionId: turn.sessionId,
    source: responseSource,
    observedActionCount: postProviderResult.observedActionCount,
  });

  return postProviderResult.response;
}
