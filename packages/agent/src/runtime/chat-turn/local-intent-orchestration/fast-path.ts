import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { requiresPreferredLocalIntentSynthesis } from "../model-input";
import type { TurnState } from "../state";
import { storeSessionMessage } from "../state";
import { executeApprovedDirectLocalIntent } from "./approval";
import { createDirectLocalIntentLoader } from "./loader";
import type {
  PreferredLocalIntentFastPathDependencies,
  PreferredLocalIntentFastPathResult,
} from "./types";

export async function runPreferredLocalIntentFastPath(input: {
  input: import("@/types/runtime").ChatTurnRequest;
  effectiveInput: import("@/types/runtime").ChatTurnRequest;
  context: AgentExecutionContext;
  options?: AgentTurnHooks;
  turn: TurnState;
  scheduleProfileObservation: () => void;
}): Promise<PreferredLocalIntentFastPathResult>;
export async function runPreferredLocalIntentFastPath(
  input: {
    input: import("@/types/runtime").ChatTurnRequest;
    effectiveInput: import("@/types/runtime").ChatTurnRequest;
    context: AgentExecutionContext;
    options?: AgentTurnHooks;
    turn: TurnState;
    scheduleProfileObservation: () => void;
  },
  dependencies: PreferredLocalIntentFastPathDependencies,
): Promise<PreferredLocalIntentFastPathResult>;
export async function runPreferredLocalIntentFastPath(
  input: {
    input: import("@/types/runtime").ChatTurnRequest;
    effectiveInput: import("@/types/runtime").ChatTurnRequest;
    context: AgentExecutionContext;
    options?: AgentTurnHooks;
    turn: TurnState;
    scheduleProfileObservation: () => void;
  },
  dependencies: PreferredLocalIntentFastPathDependencies = {},
): Promise<PreferredLocalIntentFastPathResult> {
  const createLoader =
    dependencies.createDirectLocalIntentLoader ?? createDirectLocalIntentLoader;
  const approveDirectLocalIntent =
    dependencies.executeApprovedDirectLocalIntent ??
    executeApprovedDirectLocalIntent;
  const persistSessionMessage =
    dependencies.storeSessionMessage ?? storeSessionMessage;

  const loadDirectLocalIntent = createLoader(
    input.effectiveInput,
    input.context,
  );
  const preferredLocalIntent = input.turn.localInteractive
    ? await loadDirectLocalIntent()
    : null;

  if (
    preferredLocalIntent?.directLocalIntent &&
    preferredLocalIntent.isHighConfidenceDirectLocalIntent(
      preferredLocalIntent.directLocalIntent as never,
    ) &&
    !requiresPreferredLocalIntentSynthesis(preferredLocalIntent)
  ) {
    const approvalResponse = await approveDirectLocalIntent(
      input.input,
      input.context,
      input.options,
      input.turn,
      preferredLocalIntent.directLocalIntent as { label?: string },
    );
    if (approvalResponse) {
      return {
        kind: "approval",
        response: approvalResponse,
        loadDirectLocalIntent,
        preferredLocalIntent,
      };
    }

    const directResponse = await preferredLocalIntent.executeDirectLocalIntent(
      preferredLocalIntent.directLocalIntent as never,
      input.turn.sessionId,
      input.context,
      input.options,
    );
    persistSessionMessage(input.context, {
      sessionId: input.turn.sessionId,
      roomId: input.turn.roomId,
      entityId: input.turn.entityId,
      role: "assistant",
      text: directResponse,
    });
    input.context.services.runController.finishTurn(
      input.turn.sessionId,
      "complete",
    );
    input.scheduleProfileObservation();

    return {
      kind: "direct-response",
      response: directResponse,
      loadDirectLocalIntent,
      preferredLocalIntent,
    };
  }

  return {
    kind: "continue",
    loadDirectLocalIntent,
    preferredLocalIntent,
  };
}
