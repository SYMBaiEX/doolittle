import type { ChatTurnRequest } from "../../../types/runtime/index";
import { readWorkerBotProfile } from "../../bootstrap/bot-profile";
import type { AgentExecutionContext } from "../../chat";
import { matchesRegisteredClientControl } from "../../command-shortcut-match";
import { hasWorkspaceMutationObligation } from "../../workspace-mutation-intent";
import { currentConversationWorkspace } from "../../workspace-scope";
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
  const inspectWorkspace =
    input.effectiveInput.message.trim() === "/workspace tree" &&
    Boolean(currentConversationWorkspace() && readWorkerBotProfile());
  const routingOwner =
    inspectWorkspace ||
    matchesRegisteredClientControl(
      input.context.runtime,
      input.effectiveInput.message,
    )
      ? "doolittle"
      : "eliza-message-service";
  await startTrackedTurn(
    input.input,
    input.context,
    turn,
    messagePolicy,
    routingOwner,
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
    text: `[turn:routed] owner=${routingOwner} depth=${messagePolicy.runDepth}`,
    metadata: {
      originalMessage: input.input.message,
      effectiveMessage: input.effectiveInput.message,
      routingOwner,
      messagePolicy,
    },
  });

  return {
    turn,
    scheduleProfileObservation,
    messagePolicy,
    settingsBefore: turn.settings,
    inspectWorkspace,
  };
}
