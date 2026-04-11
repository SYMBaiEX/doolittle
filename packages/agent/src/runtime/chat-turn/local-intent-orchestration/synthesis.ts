import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import { executeApprovedDirectLocalIntent } from "./approval";
import type {
  DirectLocalIntentLoader,
  PreferredLocalIntentSynthesisDependencies,
  PreferredLocalIntentSynthesisResult,
} from "./types";

export async function buildPreferredLocalIntentSynthesisPrelude(
  input: {
    input: ChatTurnRequest;
    context: AgentExecutionContext;
    options?: AgentTurnHooks;
    turn: import("../state").TurnState;
    preferredLocalIntent?: DirectLocalIntentLoader | null;
  },
  dependencies: PreferredLocalIntentSynthesisDependencies = {},
): Promise<PreferredLocalIntentSynthesisResult> {
  const approveDirectLocalIntent =
    dependencies.executeApprovedDirectLocalIntent ??
    executeApprovedDirectLocalIntent;

  if (!input.preferredLocalIntent?.directLocalIntent) {
    throw new Error(
      "Preferred local intent synthesis was requested without a direct local intent.",
    );
  }

  const approvalResponse = await approveDirectLocalIntent(
    input.input,
    input.context,
    input.options,
    input.turn,
    input.preferredLocalIntent.directLocalIntent as { label?: string },
  );
  if (approvalResponse) {
    return {
      kind: "approval",
      response: approvalResponse,
    };
  }

  const localInspection =
    await input.preferredLocalIntent.executeDirectLocalIntent(
      input.preferredLocalIntent.directLocalIntent as never,
      input.turn.sessionId,
      input.context,
      input.options,
    );

  return {
    kind: "continue",
    localSynthesisPrelude: [
      "Local workspace inspection already executed for this turn.",
      "Use these verified repo facts in the answer instead of asking to inspect again.",
      localInspection,
    ].join("\n"),
  };
}
