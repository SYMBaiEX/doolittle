import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { getProviderReadinessMessage } from "@/runtime/linked-provider-accounts";
import {
  classifyTurnMessage,
  deriveTurnExecutionPolicy,
  isSimpleSocialMessage,
  type TurnExecutionPolicy,
} from "@/runtime/turn-classification";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import { readInformationalResponseCache } from "./cache";
import { finalizeTurnResponse, isTurnReadinessMessage } from "./finalization";
import {
  buildPreferredLocalIntentSynthesisPrelude,
  executeApprovedDirectLocalIntent,
  runPreferredLocalIntentFastPath,
} from "./local-intent-orchestration";
import { createModelInputAssembly } from "./model-input";
import { runPostProviderTurn } from "./post-provider";
import { runProviderModelTurn } from "./provider";
import { buildSimpleGreetingReply } from "./response-shaping";
import {
  type PreparedTurnState,
  prepareTurnState,
  startTrackedTurn,
  type TurnState,
} from "./state";

type SettingsSnapshot = ReturnType<
  AgentExecutionContext["services"]["settings"]["get"]
>;

export type TurnPerfTrace = {
  mark(phase: string): void;
  flush(
    logger: AgentExecutionContext["runtime"]["logger"] | undefined,
    metadata: Record<string, unknown>,
  ): void;
};

export type NativeTurnSetup = {
  turn: TurnState;
  scheduleProfileObservation: () => void;
  derivedTurnPolicy: TurnExecutionPolicy;
  turnClassification: ReturnType<typeof classifyTurnMessage>;
  settingsBefore: SettingsSnapshot;
};

export function prepareNativeTurnSetup(input: {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  preparedTurn?: PreparedTurnState;
}): NativeTurnSetup {
  const { turn, scheduleProfileObservation } =
    input.preparedTurn ?? prepareTurnState(input.input, input.context);
  const derivedTurnPolicy = deriveTurnExecutionPolicy(
    input.effectiveInput.message,
    turn.settings.agent,
    {
      localInteractive: turn.localInteractive,
    },
  );
  startTrackedTurn(input.input, input.context, turn, derivedTurnPolicy);

  return {
    turn,
    scheduleProfileObservation,
    derivedTurnPolicy,
    turnClassification: classifyTurnMessage(input.effectiveInput.message),
    settingsBefore: turn.settings,
  };
}

export async function runNativeMessageTurn(input: {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  options?: AgentTurnHooks & {
    runtimeOverrides?: CronJobRuntimeOverrides;
    personalityId?: string;
  };
  perf: TurnPerfTrace;
  turnSetup: NativeTurnSetup;
  settingsDuring: SettingsSnapshot;
}): Promise<string> {
  const turn = input.turnSetup.turn;
  const scheduleProfileObservation = input.turnSetup.scheduleProfileObservation;
  const derivedTurnPolicy = input.turnSetup.derivedTurnPolicy;
  const settingsBefore = input.turnSetup.settingsBefore;

  if (
    turn.localInteractive &&
    isSimpleSocialMessage(input.effectiveInput.message)
  ) {
    const greetingResponse = buildSimpleGreetingReply(
      input.effectiveInput.message,
    );
    await finalizeTurnResponse(
      input.context,
      turn,
      greetingResponse,
      scheduleProfileObservation,
      input.options,
      "model",
    );
    input.perf.flush(input.context.runtime.logger, {
      path: "simple-greeting",
      sessionId: turn.sessionId,
      source: input.input.source ?? "cli",
    });
    return greetingResponse;
  }

  const preferredLocalIntentFastPath = await runPreferredLocalIntentFastPath({
    input: input.input,
    effectiveInput: input.effectiveInput,
    context: input.context,
    options: input.options,
    turn,
    scheduleProfileObservation,
  });
  const { loadDirectLocalIntent, preferredLocalIntent } =
    preferredLocalIntentFastPath;
  const turnClassification = input.turnSetup.turnClassification;

  if (preferredLocalIntentFastPath.kind === "approval") {
    return preferredLocalIntentFastPath.response;
  }

  if (preferredLocalIntentFastPath.kind === "direct-response") {
    input.perf.mark("preferred-local-intent");
    input.perf.flush(input.context.runtime.logger, {
      path: "preferred-local-intent",
      sessionId: turn.sessionId,
      source: input.input.source ?? "cli",
    });
    return preferredLocalIntentFastPath.response;
  }

  const modelInputAssembly = createModelInputAssembly({
    context: input.context,
    turn,
    effectiveInput: input.effectiveInput,
    derivedTurnPolicy,
    turnClassification,
    settingsDuring: input.settingsDuring,
    options: input.options,
    preferredLocalIntent,
  });

  const responseCacheKey = modelInputAssembly.responseCacheKey;
  if (responseCacheKey) {
    const cachedResponse = readInformationalResponseCache(responseCacheKey);
    if (cachedResponse) {
      await finalizeTurnResponse(
        input.context,
        turn,
        cachedResponse,
        scheduleProfileObservation,
        input.options,
        "model",
      );
      input.perf.flush(input.context.runtime.logger, {
        path: "informational-response-cache",
        sessionId: turn.sessionId,
        source: input.input.source ?? "cli",
      });
      return cachedResponse;
    }
  }

  let localSynthesisPrelude: string | undefined;
  if (modelInputAssembly.requiresPreferredLocalIntentSynthesis) {
    const synthesisResult = await buildPreferredLocalIntentSynthesisPrelude({
      input: input.input,
      context: input.context,
      options: input.options,
      turn,
      preferredLocalIntent,
    });
    if (synthesisResult.kind === "approval") {
      return synthesisResult.response;
    }
    localSynthesisPrelude = synthesisResult.localSynthesisPrelude;
  }

  const { effectiveMessage } = modelInputAssembly.build(localSynthesisPrelude);
  const readinessMessage = await getProviderReadinessMessage(
    input.context,
    input.settingsDuring.model.provider,
  );
  input.perf.mark("provider-readiness");
  if (isTurnReadinessMessage(readinessMessage)) {
    await finalizeTurnResponse(
      input.context,
      turn,
      readinessMessage,
      scheduleProfileObservation,
      input.options,
      "readiness",
    );
    input.perf.flush(input.context.runtime.logger, {
      path: "provider-readiness",
      sessionId: turn.sessionId,
      source: input.input.source ?? "cli",
    });
    return readinessMessage;
  }

  const providerResult = await runProviderModelTurn({
    context: input.context,
    turn,
    effectiveMessage,
    settingsBefore,
    settingsDuring: input.settingsDuring,
    capabilityProfile: modelInputAssembly.capabilityProfile,
    derivedTurnPolicy,
    options: input.options,
    loadDirectLocalIntent,
  });
  const response = providerResult.response;
  const runFailureMessage = providerResult.runFailureMessage;
  if (providerResult.handledMessage) {
    input.perf.mark("native-handle-message");
  }
  const postProviderResult = await runPostProviderTurn({
    input: input.input,
    effectiveInput: input.effectiveInput,
    context: input.context,
    options: input.options,
    turn,
    response,
    runFailureMessage,
    settingsDuring: input.settingsDuring,
    responseCacheKey,
    scheduleProfileObservation,
    loadDirectLocalIntent,
    approveDirectLocalIntent: async (
      intent: { label?: string },
      pendingNotice?: string,
    ) =>
      executeApprovedDirectLocalIntent(
        input.input,
        input.context,
        input.options,
        turn,
        intent,
        pendingNotice,
      ),
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
    source: input.input.source ?? "cli",
    observedActionCount: postProviderResult.observedActionCount,
  });

  return postProviderResult.response;
}
