import type { ActionResult } from "@elizaos/core";
import {
  buildCodingIterationFromActionResults,
  summarizeActionResults,
} from "@/runtime/action-result-metadata";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { buildProviderNoResponseMessage } from "@/runtime/linked-provider-accounts";
import type { ChatTurnRequest } from "@/types/runtime";
import {
  getContextUsageWarning,
  maybeGetSkillSynthesisNudge,
} from "../finalization";
import type { TurnState } from "../state";
import { storeSessionMessage } from "../state";
import { recordTrajectoryEvent } from "../trajectory";
import type {
  PostProviderFinalResult,
  PostProviderSettingsSnapshot,
} from "./types";

export function buildPostProviderFinalResponse(input: {
  effectiveInput: ChatTurnRequest;
  response: string;
  runFailureMessage?: string;
  observedActionCount: number;
  settingsDuring: PostProviderSettingsSnapshot;
}): string {
  const normalizedResponse = input.response.trim();

  return (
    normalizedResponse ||
    buildProviderNoResponseMessage(
      input.settingsDuring.model.provider,
      input.settingsDuring.model.model,
    )
  );
}

export async function emitPostProviderNotices(input: {
  input: ChatTurnRequest;
  context: AgentExecutionContext;
  options?: AgentTurnHooks;
  turn: TurnState;
}): Promise<void> {
  const usageWarning = input.turn.localInteractive
    ? getContextUsageWarning(input.context, input.turn.sessionId)
    : undefined;

  const sessionTurnCount = input.context.services.sessions.countBySessionRole(
    input.turn.sessionId,
    "assistant",
  );
  const skillNudge =
    input.turn.localInteractive && (input.input.source ?? "cli") !== "cron"
      ? maybeGetSkillSynthesisNudge(
          input.context,
          input.turn.sessionId,
          sessionTurnCount,
        )
      : undefined;

  if (usageWarning) {
    await input.options?.onNotice?.({
      kind: "context",
      message: usageWarning.trim(),
    });
  }

  if (skillNudge) {
    await input.options?.onNotice?.({
      kind: "skills",
      message: skillNudge.trim(),
    });
  }
}

export function finalizePostProviderTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  finalResponse: string;
  runFailureMessage?: string;
  observedActionCount: number;
  actionResults?: ActionResult[];
  usedFallback: boolean;
  settingsDuring: PostProviderSettingsSnapshot;
  scheduleProfileObservation: () => void;
}): PostProviderFinalResult {
  storeSessionMessage(input.context, {
    sessionId: input.turn.sessionId,
    roomId: input.turn.roomId,
    entityId: input.turn.entityId,
    role: "assistant",
    text: input.finalResponse,
  });
  const modelSettings = input.settingsDuring.model ?? {};
  const actionResultSummary = summarizeActionResults(input.actionResults);
  const codingIteration = buildCodingIterationFromActionResults(
    input.actionResults,
    {
      summary: input.runFailureMessage
        ? "Turn failed after SDK action execution."
        : "Turn completed after SDK action execution.",
    },
  );
  recordTrajectoryEvent(input.context, {
    category: "turn",
    event: input.runFailureMessage ? "turn.failed" : "turn.completed",
    sessionId: input.turn.sessionId,
    runId: input.turn.runId,
    roomId: String(input.turn.roomId),
    source: input.turn.connectionSource,
    provider: modelSettings.provider ?? "unknown",
    model: modelSettings.model ?? "unknown",
    text: `[turn:${
      input.runFailureMessage ? "failed" : "completed"
    }] ${input.finalResponse}`,
    metadata: {
      response: input.finalResponse,
      responseChars: input.finalResponse.length,
      observedActionCount: input.observedActionCount,
      actionResults: actionResultSummary.actionResults,
      localMutations: actionResultSummary.localMutations,
      fileOperations: actionResultSummary.fileOperations,
      commandResults: actionResultSummary.commandResults,
      codingIteration,
      usedFallback: input.usedFallback,
      runFailureMessage: input.runFailureMessage,
    },
  });

  input.context.services.runController.finishTurn(
    input.turn.sessionId,
    input.runFailureMessage ? "error" : "complete",
    input.runFailureMessage,
  );
  input.scheduleProfileObservation();

  return {
    kind: "final",
    response: input.finalResponse,
    runFailureMessage: input.runFailureMessage,
    observedActionCount: input.observedActionCount,
    usedFallback: input.usedFallback,
  };
}
