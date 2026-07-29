import type { AgentRuntime, IAgentRuntime } from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { getProviderReadinessMessage } from "@/runtime/linked-provider-accounts";
import type { ChatTurnRequest } from "@/types/runtime";
import { runPostProviderTurn } from "../post-provider";
import { runProviderModelTurn } from "../provider";
import { handleReadyResponseTurn } from "./readiness";
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
  hasProviderIndependentShortcut: typeof hasProviderIndependentShortcut;
  getProviderReadinessMessage: typeof getProviderReadinessMessage;
  handleReadyResponseTurn: typeof handleReadyResponseTurn;
  runProviderModelTurn: typeof runProviderModelTurn;
  runPostProviderTurn: typeof runPostProviderTurn;
}

export function hasProviderIndependentShortcut(
  runtime: IAgentRuntime,
  message: string,
): boolean {
  const shortcutRegistry = (
    runtime as IAgentRuntime & Pick<AgentRuntime, "shortcutRegistry">
  ).shortcutRegistry;
  const match = shortcutRegistry?.match(message, {
    actions: runtime.actions.map((action) => action.name),
    allowNatural: false,
  });
  return match?.shortcut.kind === "explicit";
}

const defaultDependencies: NativeProviderStageDependencies = {
  hasProviderIndependentShortcut,
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
  const messagePolicy = input.turnSetup.messagePolicy;
  const settingsBefore = input.turnSetup.settingsBefore;
  const responseSource = input.input.source ?? "cli";
  const providerIndependentShortcut =
    dependencies.hasProviderIndependentShortcut(
      input.context.runtime,
      input.effectiveInput.message,
    );
  const readinessMessage = providerIndependentShortcut
    ? undefined
    : await dependencies.getProviderReadinessMessage(
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
