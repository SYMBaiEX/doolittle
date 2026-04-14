import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import { executeApprovedDirectLocalIntent } from "./local-intent-orchestration/approval";
import { runPreferredLocalIntentFastPath } from "./local-intent-orchestration/fast-path";
import { runNativeProviderStage } from "./native/provider-stage";
import { handleSimpleGreetingTurn } from "./native/shortcuts";
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

  const greetingResponse = await handleSimpleGreetingTurn({
    context: input.context,
    turn,
    message: input.effectiveInput.message,
    scheduleProfileObservation,
    options: input.options,
    perf: input.perf,
    source: input.input.source,
  });
  if (greetingResponse) {
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
