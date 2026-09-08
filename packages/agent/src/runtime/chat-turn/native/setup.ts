import type { AgentExecutionContext } from "@/runtime/chat";
import { hasWorkspaceMutationObligation } from "@/runtime/workspace-mutation-intent";
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
  userRequest = "",
  continuesMutation = false,
): NativeMessagePolicy {
  const requiresWorkspaceMutation =
    hasWorkspaceMutationObligation(userRequest) || continuesMutation;
  const runDepth =
    requiresWorkspaceMutation && agent.runDepth === "quick"
      ? "standard"
      : agent.runDepth;
  // A mutating coding turn needs room for inspect -> edit -> verify. Quick
  // remains quick for ordinary chat, but must not collapse an explicit coding
  // request into the SDK's single top-level planning pass.
  const maxIterations = requiresWorkspaceMutation
    ? Math.max(45, agent.maxIterations)
    : Math.max(1, agent.maxIterations);
  return {
    runDepth,
    maxIterations,
    toolProgressMode: agent.toolProgressMode,
    // Retained for pre-v5 message-service compatibility. Eliza v5 owns routing
    // through Stage 1 regardless of this legacy flag; Doolittle's completion
    // safety is enforced by native response routing plus mutation receipts.
    useMultiStep: runDepth !== "quick" && maxIterations > 1,
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
  let recentMessages: Array<{ role?: string; text?: string }> = [];
  try {
    recentMessages = input.context.services.sessions.recentBySession(
      turn.sessionId,
      6,
    );
  } catch {
    // Session history is supplementary. A new session can route without it.
  }
  const messagePolicy = resolveNativeMessagePolicy(
    turn.settings.agent,
    input.effectiveInput.message,
    hasWorkspaceMutationObligation(
      input.effectiveInput.message,
      recentMessages,
    ),
  );
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
