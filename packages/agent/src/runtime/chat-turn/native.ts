import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import { executeApprovedDirectLocalIntent } from "./local-intent-orchestration/approval";
import { runPreferredLocalIntentFastPath } from "./local-intent-orchestration/fast-path";
import {
  handleProfileMemoryModelTurn,
  handleSoulIdentityModelTurn,
} from "./native/profile-memory";
import { runNativeProviderStage } from "./native/provider-stage";
import { handleDirectInformationalModelTurn } from "./native/shortcuts";
import type {
  NativeTurnSetup,
  SettingsSnapshot,
  TurnPerfTrace,
} from "./native/types";

export { prepareNativeTurnSetup } from "./native/setup";
export type {
  NativeTurnSetup,
  SettingsSnapshot,
  TurnPerfTrace,
} from "./native/types";

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
  const hasAttachments = Boolean(input.effectiveInput.attachments?.length);

  if (!hasAttachments) {
    const profileMemoryResponse = await handleProfileMemoryModelTurn({
      context: input.context,
      turn,
      userId: input.effectiveInput.userId,
      message: input.effectiveInput.message,
      scheduleProfileObservation,
      options: input.options,
      perf: input.perf,
      source: input.input.source,
    });
    if (profileMemoryResponse) {
      return profileMemoryResponse;
    }

    const soulIdentityResponse = await handleSoulIdentityModelTurn({
      context: input.context,
      turn,
      userId: input.effectiveInput.userId,
      message: input.effectiveInput.message,
      scheduleProfileObservation,
      options: input.options,
      perf: input.perf,
      source: input.input.source,
    });
    if (soulIdentityResponse) {
      return soulIdentityResponse;
    }

    const directInformationalResponse =
      await handleDirectInformationalModelTurn({
        context: input.context,
        turn,
        userId: input.effectiveInput.userId,
        message: input.effectiveInput.message,
        classification: input.turnSetup.turnClassification,
        scheduleProfileObservation,
        options: input.options,
        perf: input.perf,
        source: input.input.source,
      });
    if (directInformationalResponse) {
      return directInformationalResponse;
    }
  }

  const preferredLocalIntentFastPath = await runPreferredLocalIntentFastPath({
    input: input.input,
    effectiveInput: input.effectiveInput,
    context: input.context,
    options: input.options,
    turn,
    scheduleProfileObservation,
    allowDirectResponse: !hasAttachments,
  });
  const { loadDirectLocalIntent, preferredLocalIntent } =
    preferredLocalIntentFastPath;

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

  return runNativeProviderStage({
    input: input.input,
    effectiveInput: input.effectiveInput,
    context: input.context,
    options: input.options,
    perf: input.perf,
    turnSetup: input.turnSetup,
    settingsDuring: input.settingsDuring,
    loadDirectLocalIntent,
    preferredLocalIntent,
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
}
