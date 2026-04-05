import { randomUUID } from "node:crypto";
import { type Content, EventType, type Memory, type UUID } from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { StreamingOutputModel } from "./provider-streaming";

export type ProviderTurnSettingsSnapshot = {
  model: {
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
};

export type DirectLocalIntentFallbackLoader = () => Promise<
  | {
      directLocalIntent?: unknown;
    }
  | undefined
>;

export type ProviderMessageExecutionResult = {
  handledMessage: boolean;
  response: string;
  runFailureMessage?: string;
};

type ProviderMessageExecutionInput = {
  context: AgentExecutionContext;
  memory: Memory;
  streamState: StreamingOutputModel;
  derivedTurnPolicy: {
    useMultiStep: boolean;
    maxIterations: number;
  };
  abortSignal: AbortSignal | undefined;
  settingsDuring: ProviderTurnSettingsSnapshot;
  loadDirectLocalIntent: DirectLocalIntentFallbackLoader;
  onNotice?: (notice: {
    kind: "status";
    message: string;
  }) => Promise<void> | void;
  connectionSource: string;
  roomId: string;
  buildProviderFailureMessage: (
    provider: string,
    model: string,
    error: unknown,
    baseUrl: string,
  ) => string;
  buildNativePlanningFailureMessage: () => string;
  isRecoverableNativePlanningError: (error: unknown) => boolean;
};

export async function executeProviderMessageTurn(
  input: ProviderMessageExecutionInput,
): Promise<ProviderMessageExecutionResult> {
  let handledMessage = false;
  let response = input.streamState.getResponse();
  let runFailureMessage: string | undefined;

  try {
    const messageResult =
      await input.context.runtime.messageService?.handleMessage(
        input.context.runtime,
        input.memory,
        input.streamState.onCallbackContent,
        {
          useMultiStep: input.derivedTurnPolicy.useMultiStep,
          maxMultiStepIterations: input.derivedTurnPolicy.useMultiStep
            ? input.derivedTurnPolicy.maxIterations
            : 1,
          abortSignal: input.abortSignal,
          onStreamChunk: input.onNotice
            ? input.streamState.onStreamChunk
            : undefined,
        },
      );
    handledMessage = true;
    if (
      Array.isArray(messageResult?.responseMessages) &&
      typeof input.context.runtime.emitEvent === "function"
    ) {
      for (const responseMessage of messageResult.responseMessages) {
        const content = (responseMessage as { content?: Content }).content ?? {
          text: "",
        };
        const emittedMessage = {
          id: (responseMessage as { id?: string }).id ?? (randomUUID() as UUID),
          roomId: input.memory.roomId,
          entityId: input.context.runtime.agentId as UUID,
          content,
          metadata: input.memory.metadata,
        } as Memory;
        await input.context.runtime.emitEvent(EventType.MESSAGE_SENT, {
          runtime: input.context.runtime,
          message: emittedMessage,
          source: input.connectionSource,
        });
      }
    }
    response = input.streamState.getResponse();
  } catch (error) {
    const isRecoverable = input.isRecoverableNativePlanningError(error);
    const directFallback = isRecoverable
      ? await input.loadDirectLocalIntent()
      : undefined;
    if (isRecoverable && directFallback?.directLocalIntent) {
      runFailureMessage =
        error instanceof Error ? error.message.trim() : String(error).trim();
      response = "";
      input.streamState.setResponse(response);
    } else {
      const failureMessage = isRecoverable
        ? input.buildNativePlanningFailureMessage()
        : input.buildProviderFailureMessage(
            input.settingsDuring.model.provider,
            input.settingsDuring.model.model,
            error,
            input.settingsDuring.model.baseUrl,
          );
      input.context.runtime.logger?.warn(
        {
          error,
          provider: input.settingsDuring.model.provider,
          model: input.settingsDuring.model.model,
          roomId: input.roomId,
        },
        "Local agent turn failed in provider runtime",
      );
      await input.onNotice?.({
        kind: "status",
        message: failureMessage,
      });
      response = failureMessage;
      runFailureMessage = failureMessage;
      input.streamState.setResponse(response);
    }
  }

  return {
    handledMessage,
    response,
    runFailureMessage,
  };
}
