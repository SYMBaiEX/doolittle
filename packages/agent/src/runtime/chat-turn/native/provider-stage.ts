import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import { runPostProviderTurn } from "../post-provider";
import { runProviderModelTurn } from "../provider";
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
}

export interface NativeProviderStageDependencies {
  runProviderModelTurn: typeof runProviderModelTurn;
  runPostProviderTurn: typeof runPostProviderTurn;
}

const defaultDependencies: NativeProviderStageDependencies = {
  runProviderModelTurn,
  runPostProviderTurn,
};

export async function runNativeProviderStage(
  input: NativeProviderStageInput,
  dependencies: NativeProviderStageDependencies = defaultDependencies,
): Promise<string> {
  const turn = input.turnSetup.turn;
  const scheduleProfileObservation = input.turnSetup.scheduleProfileObservation;
  const messagePolicy = input.turnSetup.messagePolicy;
  const settingsBefore = input.turnSetup.settingsBefore;
  const responseSource = input.input.source ?? "cli";
  const providerResult = await dependencies.runProviderModelTurn({
    context: input.context,
    turn,
    userId: input.effectiveInput.userId,
    effectiveMessage: input.effectiveInput.message,
    settingsBefore,
    settingsDuring: input.settingsDuring,
    messagePolicy,
    options: input.options,
    attachments: input.effectiveInput.attachments,
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
    actionResults: providerResult.actionResults,
    nativeResponseMessages: providerResult.responseMessages,
    settingsDuring: input.settingsDuring,
    scheduleProfileObservation,
  });

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
