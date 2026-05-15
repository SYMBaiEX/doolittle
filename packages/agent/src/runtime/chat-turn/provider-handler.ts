import { randomUUID } from "node:crypto";
import {
  type ActionResult,
  type Content,
  EventType,
  type Memory,
  setTrajectoryPurpose,
  type UUID,
} from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { StreamingOutputModel } from "./provider-streaming";
import {
  elapsedMsSince,
  readSdkTrajectoryStepId,
  recordTrajectoryEvent,
  runWithSdkTrajectoryContext,
} from "./trajectory";

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
  messageId: string;
  actionResults: ActionResult[];
};

type ProviderMessageExecutionInput = {
  context: AgentExecutionContext;
  memory: Memory;
  sessionId?: string;
  runId?: string;
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

function memoryText(memory: Memory): string {
  const content = memory.content as { text?: unknown } | undefined;
  return typeof content?.text === "string" ? content.text : "";
}

function doolittleMessagePrelude(memory: Memory): string {
  const metadata = memory.metadata as
    | { doolittle?: { messagePrelude?: unknown } }
    | undefined;
  const prelude = metadata?.doolittle?.messagePrelude;
  return typeof prelude === "string" ? prelude : "";
}

export async function executeProviderMessageTurn(
  input: ProviderMessageExecutionInput,
): Promise<ProviderMessageExecutionResult> {
  let handledMessage = false;
  let response = input.streamState.getResponse();
  let runFailureMessage: string | undefined;
  const startedAt = performance.now();
  const prompt = memoryText(input.memory);
  const messagePrelude = doolittleMessagePrelude(input.memory);
  const sessionId = input.sessionId ?? String(input.memory.roomId);
  const messageId = String(input.memory.id);
  let actionResults: ActionResult[] = [];

  await runWithSdkTrajectoryContext(
    input.context,
    {
      runId: input.runId,
      roomId: input.roomId,
      messageId,
      source: input.connectionSource,
      purpose: "response",
      metadata: {
        path: "provider-message-service",
        runId: input.runId,
        roomId: input.roomId,
        messageId,
        sessionId,
        provider: input.settingsDuring.model.provider,
        model: input.settingsDuring.model.model,
      },
      metadataTarget: input.memory,
    },
    async () => {
      recordTrajectoryEvent(input.context, {
        category: "model",
        event: "model.request",
        sessionId,
        runId: input.runId,
        roomId: input.roomId,
        source: input.connectionSource,
        provider: input.settingsDuring.model.provider,
        model: input.settingsDuring.model.model,
        text: `[model:request] ${input.settingsDuring.model.provider}/${input.settingsDuring.model.model}`,
        metadata: {
          path: "provider-message-service",
          trajectoryStepId: readSdkTrajectoryStepId(input.memory.metadata),
          prompt,
          promptChars: prompt.length,
          messagePrelude,
          messagePreludeChars: messagePrelude.length,
          useMultiStep: input.derivedTurnPolicy.useMultiStep,
          maxIterations: input.derivedTurnPolicy.useMultiStep
            ? input.derivedTurnPolicy.maxIterations
            : 1,
          baseUrl: input.settingsDuring.model.baseUrl,
          temperature: input.settingsDuring.model.temperature,
          maxTokens: input.settingsDuring.model.maxTokens,
        },
      });

      try {
        setTrajectoryPurpose("response");
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
            const content = (responseMessage as { content?: Content })
              .content ?? {
              text: "",
            };
            const emittedMessage = {
              id:
                (responseMessage as { id?: string }).id ??
                (randomUUID() as UUID),
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
            error instanceof Error
              ? error.message.trim()
              : String(error).trim();
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
      } finally {
        actionResults =
          input.context.runtime.getActionResults?.(messageId) ?? [];
        const elapsedMs = elapsedMsSince(startedAt);
        recordTrajectoryEvent(input.context, {
          category: "model",
          event: runFailureMessage ? "model.error" : "model.response",
          sessionId,
          runId: input.runId,
          roomId: input.roomId,
          source: input.connectionSource,
          provider: input.settingsDuring.model.provider,
          model: input.settingsDuring.model.model,
          elapsedMs,
          text: `[model:${runFailureMessage ? "error" : "response"}] ${response}`,
          metadata: {
            path: "provider-message-service",
            trajectoryStepId: readSdkTrajectoryStepId(input.memory.metadata),
            handledMessage,
            messageId,
            actionResults,
            response,
            responseChars: response.length,
            runFailureMessage,
          },
        });
      }
    },
  );

  return {
    handledMessage,
    response,
    runFailureMessage,
    messageId,
    actionResults,
  };
}
