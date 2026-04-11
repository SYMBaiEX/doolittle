import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import {
  ensureLocalInteractiveSettingsState,
  ensureTurnConnection,
} from "./connection";
import {
  prepareNativeTurnSetup,
  runNativeMessageTurn,
  type TurnPerfTrace,
} from "./native";
import { applyRuntimeOverrides } from "./overrides";
import { runShellPostCommandTurn } from "./shell";
import { type PreparedTurnState, prepareTurnState } from "./state";

type PostCommandTurnRunner = {
  runShellPostCommandTurn: typeof runShellPostCommandTurn;
  runNativeMessageTurn: typeof runNativeMessageTurn;
  prepareNativeTurnSetup: typeof prepareNativeTurnSetup;
};

const postCommandTurnRunner: PostCommandTurnRunner = {
  runShellPostCommandTurn,
  runNativeMessageTurn,
  prepareNativeTurnSetup,
};

export async function runPostCommandTurn(
  input: ChatTurnRequest,
  effectiveInput: ChatTurnRequest,
  context: AgentExecutionContext,
  options: AgentTurnHooks & {
    runtimeOverrides?: CronJobRuntimeOverrides;
    personalityId?: string;
  },
  perf: TurnPerfTrace,
  runner: PostCommandTurnRunner = postCommandTurnRunner,
  preparedTurn?: PreparedTurnState,
): Promise<string> {
  const prepared = preparedTurn ?? prepareTurnState(input, context);
  const turn = prepared.turn;
  await ensureTurnConnection(context, {
    entityId: turn.entityId,
    roomId: turn.roomId,
    worldId: turn.worldId,
    source: turn.connectionSource,
    channelId: turn.localInteractive ? turn.sessionId : turn.worldId,
    messageServerId: turn.messageServerId,
  });
  await ensureLocalInteractiveSettingsState(context, turn);

  const shellResponse = await runner.runShellPostCommandTurn({
    input,
    effectiveInput,
    context,
    options,
    perf,
    preparedTurn: prepared,
  });
  if (shellResponse !== undefined) {
    return shellResponse;
  }

  const nativeTurnSetup = runner.prepareNativeTurnSetup({
    input,
    effectiveInput,
    context,
    preparedTurn: prepared,
  });
  const settingsDuring = applyRuntimeOverrides(
    nativeTurnSetup.settingsBefore,
    options?.runtimeOverrides,
  );

  return runner.runNativeMessageTurn({
    input,
    effectiveInput,
    context,
    options,
    perf,
    turnSetup: nativeTurnSetup,
    settingsDuring,
  });
}
