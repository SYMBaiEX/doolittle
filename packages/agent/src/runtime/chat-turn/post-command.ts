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
  try {
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
  } catch (error) {
    // Guarantee the run is finished even when execution throws before any
    // success/error path finalizes it — otherwise the run is stranded in
    // "thinking". Guard on the active run so an inner path that already
    // finalized (and rethrew) is never double-finished.
    if (context.services.runController.getActive(turn.sessionId)) {
      context.services.runController.finishTurn(
        turn.sessionId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
  }
}
