import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { buildProviderNoResponseMessage } from "@/runtime/linked-provider-accounts";
import { isSimpleGreetingMessage } from "@/runtime/turn-classification";
import type { ChatTurnRequest } from "@/types/runtime";
import { writeInformationalResponseCache } from "./cache";
import {
  getContextUsageWarning,
  maybeGetSkillSynthesisNudge,
} from "./finalization";
import { buildSimpleGreetingReply } from "./response-shaping";
import type { TurnState } from "./state";
import { storeSessionMessage } from "./state";

type SettingsSnapshot = ReturnType<
  AgentExecutionContext["services"]["settings"]["get"]
>;

type DirectLocalIntentLoader = {
  directLocalIntent: unknown;
  executeDirectLocalIntent: (
    intent: never,
    sessionId: string,
    context: AgentExecutionContext,
    hooks?: AgentTurnHooks,
  ) => Promise<string>;
  isHighConfidenceDirectLocalIntent: (intent: never) => boolean;
  requiresModelSynthesisForLocalIntent: (intent: never) => boolean;
  shouldUseDirectLocalFallback: (input: {
    message: string;
    response: string;
    observedActionCount: number;
    runFailureMessage?: string;
    isHighConfidenceIntent?: boolean;
    requiresModelSynthesis?: boolean;
  }) => boolean;
};

export async function runPostProviderTurn(input: {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  options?: AgentTurnHooks;
  turn: TurnState;
  response: string;
  runFailureMessage?: string;
  settingsDuring: SettingsSnapshot;
  responseCacheKey?: string;
  scheduleProfileObservation: () => void;
  loadDirectLocalIntent: () => Promise<DirectLocalIntentLoader>;
  approveDirectLocalIntent: (
    intent: { label?: string },
    pendingNotice?: string,
  ) => Promise<string | undefined>;
}): Promise<
  | {
      kind: "approval";
      response: string;
    }
  | {
      kind: "final";
      response: string;
      runFailureMessage?: string;
      observedActionCount: number;
      usedFallback: boolean;
    }
> {
  let response = input.response;
  let runFailureMessage = input.runFailureMessage;
  let usedFallback = false;

  const observedActionCount =
    input.context.services.runController.getActive(input.turn.sessionId)
      ?.observedActionCount ?? 0;

  const fallbackModule =
    input.turn.localInteractive &&
    (observedActionCount === 0 || runFailureMessage)
      ? await input.loadDirectLocalIntent()
      : null;

  if (
    fallbackModule?.directLocalIntent &&
    fallbackModule.shouldUseDirectLocalFallback({
      message: input.effectiveInput.message,
      response,
      observedActionCount,
      runFailureMessage,
      isHighConfidenceIntent: fallbackModule.isHighConfidenceDirectLocalIntent(
        fallbackModule.directLocalIntent as never,
      ),
      requiresModelSynthesis:
        fallbackModule.requiresModelSynthesisForLocalIntent(
          fallbackModule.directLocalIntent as never,
        ),
    })
  ) {
    try {
      const approvalResponse = await input.approveDirectLocalIntent(
        fallbackModule.directLocalIntent as { label?: string },
        runFailureMessage || response.trim()
          ? "Native planning stalled on this local task, so I switched to the direct workspace executor."
          : undefined,
      );
      if (approvalResponse) {
        return {
          kind: "approval",
          response: approvalResponse,
        };
      }

      response = await fallbackModule.executeDirectLocalIntent(
        fallbackModule.directLocalIntent as never,
        input.turn.sessionId,
        input.context,
        input.options,
      );
      runFailureMessage = undefined;
      usedFallback = true;
    } catch (fallbackError) {
      if (!runFailureMessage) {
        input.context.services.runController.finishTurn(
          input.turn.sessionId,
          "error",
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
        );
        throw fallbackError;
      }
    }
  }

  const normalizedResponse = response.trim();
  const finalResponse =
    runFailureMessage &&
    observedActionCount === 0 &&
    isSimpleGreetingMessage(input.effectiveInput.message)
      ? buildSimpleGreetingReply(input.effectiveInput.message)
      : normalizedResponse ||
        buildProviderNoResponseMessage(
          input.settingsDuring.model.provider,
          input.settingsDuring.model.model,
        );

  const sessionTurnCount = input.context.services.sessions.countBySessionRole(
    input.turn.sessionId,
    "assistant",
  );

  const usageWarning = input.turn.localInteractive
    ? getContextUsageWarning(input.context, input.turn.sessionId)
    : undefined;

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

  if (
    input.responseCacheKey &&
    !runFailureMessage &&
    observedActionCount === 0 &&
    finalResponse.trim()
  ) {
    writeInformationalResponseCache(input.responseCacheKey, finalResponse);
  }

  storeSessionMessage(input.context, {
    sessionId: input.turn.sessionId,
    roomId: input.turn.roomId,
    entityId: input.turn.entityId,
    role: "assistant",
    text: finalResponse,
  });

  input.context.services.runController.finishTurn(
    input.turn.sessionId,
    runFailureMessage ? "error" : "complete",
    runFailureMessage,
  );
  input.scheduleProfileObservation();

  return {
    kind: "final",
    response: finalResponse,
    runFailureMessage,
    observedActionCount,
    usedFallback,
  };
}
