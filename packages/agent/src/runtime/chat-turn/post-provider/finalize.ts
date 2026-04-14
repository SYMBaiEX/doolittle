import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { buildProviderNoResponseMessage } from "@/runtime/linked-provider-accounts";
import { isSimpleGreetingMessage } from "@/runtime/turn-classification/message";
import type { ChatTurnRequest } from "@/types/runtime";
import { writeInformationalResponseCache } from "../cache";
import {
  getContextUsageWarning,
  maybeGetSkillSynthesisNudge,
} from "../finalization";
import { buildSimpleGreetingReply } from "../response-shaping";
import type { TurnState } from "../state";
import { storeSessionMessage } from "../state";
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

  if (
    input.runFailureMessage &&
    input.observedActionCount === 0 &&
    isSimpleGreetingMessage(input.effectiveInput.message)
  ) {
    return buildSimpleGreetingReply(input.effectiveInput.message);
  }

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
  responseCacheKey?: string;
  finalResponse: string;
  runFailureMessage?: string;
  observedActionCount: number;
  usedFallback: boolean;
  scheduleProfileObservation: () => void;
}): PostProviderFinalResult {
  if (
    input.responseCacheKey &&
    !input.runFailureMessage &&
    input.observedActionCount === 0 &&
    input.finalResponse.trim()
  ) {
    writeInformationalResponseCache(
      input.responseCacheKey,
      input.finalResponse,
    );
  }

  storeSessionMessage(input.context, {
    sessionId: input.turn.sessionId,
    roomId: input.turn.roomId,
    entityId: input.turn.entityId,
    role: "assistant",
    text: input.finalResponse,
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
