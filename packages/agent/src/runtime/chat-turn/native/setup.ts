import type { AgentExecutionContext } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import {
  type PreparedTurnState,
  prepareTurnState,
  startTrackedTurn,
} from "../state";
import { recordTrajectoryEvent } from "../trajectory";
import type { NativeMessagePolicy, NativeTurnSetup } from "./types";

export function resolveNativeMessagePolicy(
  agent: NativeTurnSetup["turn"]["settings"]["agent"],
): NativeMessagePolicy {
  return {
    runDepth: agent.runDepth,
    maxIterations: Math.max(1, agent.maxIterations),
    toolProgressMode: agent.toolProgressMode,
    // The SDK's Stage 1 handler still routes ordinary conversation to its
    // direct-reply mode. This flag only permits the native planner loop when
    // Stage 1 determines that tools or multiple steps are required.
    useMultiStep: agent.runDepth !== "quick" && agent.maxIterations > 1,
  };
}

export async function prepareNativeTurnSetup(input: {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  preparedTurn?: PreparedTurnState;
}): Promise<NativeTurnSetup> {
  const { turn, scheduleProfileObservation } =
    input.preparedTurn ?? prepareTurnState(input.input, input.context);
  const messagePolicy = resolveNativeMessagePolicy(turn.settings.agent);
  await startTrackedTurn(input.input, input.context, turn, messagePolicy);
  const modelSettings = turn.settings?.model ?? {};
  recordTrajectoryEvent(input.context, {
    category: "turn",
    event: "turn.routed",
    sessionId: turn.sessionId,
    runId: turn.runId,
    roomId: String(turn.roomId),
    source: input.input.source ?? "cli",
    provider: modelSettings.provider ?? "unknown",
    model: modelSettings.model ?? "unknown",
    text: `[turn:routed] owner=eliza-message-service mode=${
      messagePolicy.useMultiStep ? "native-planner" : "direct"
    }`,
    metadata: {
      originalMessage: input.input.message,
      effectiveMessage: input.effectiveInput.message,
      routingOwner: "eliza-message-service",
      messagePolicy,
    },
  });

  return {
    turn,
    scheduleProfileObservation,
    messagePolicy,
    settingsBefore: turn.settings,
  };
}
