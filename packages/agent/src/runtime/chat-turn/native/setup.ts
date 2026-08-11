import type { AgentExecutionContext } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import {
  type PreparedTurnState,
  prepareTurnState,
  startTrackedTurn,
} from "../state";
import { recordEvaluationTraceEvent } from "../trajectory";
import type { NativeMessagePolicy, NativeTurnSetup } from "./types";

export function resolveNativeMessagePolicy(
  agent: NativeTurnSetup["turn"]["settings"]["agent"],
): NativeMessagePolicy {
  return {
    runDepth: agent.runDepth,
    maxIterations: Math.max(1, agent.maxIterations),
    toolProgressMode: agent.toolProgressMode,
    // Retained for pre-v5 message-service compatibility. Eliza v5 owns routing
    // through Stage 1 regardless of this legacy flag; Doolittle's completion
    // safety is enforced by native response routing plus mutation receipts.
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
  await startTrackedTurn(
    input.input,
    input.context,
    turn,
    messagePolicy,
    "eliza-message-service",
  );
  const modelSettings = turn.settings?.model ?? {};
  recordEvaluationTraceEvent(input.context, {
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
