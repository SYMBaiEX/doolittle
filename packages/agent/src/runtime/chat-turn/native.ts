import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type {
  AutomationRuntimeOverrides,
  ChatTurnRequest,
} from "@/types/runtime";
import { runNativeProviderStage } from "./native/provider-stage";
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
    runtimeOverrides?: AutomationRuntimeOverrides;
    personalityId?: string;
  };
  perf: TurnPerfTrace;
  turnSetup: NativeTurnSetup;
  settingsDuring: SettingsSnapshot;
}): Promise<string> {
  return runNativeProviderStage({
    input: input.input,
    effectiveInput: input.effectiveInput,
    context: input.context,
    options: input.options,
    perf: input.perf,
    turnSetup: input.turnSetup,
    settingsDuring: input.settingsDuring,
  });
}
