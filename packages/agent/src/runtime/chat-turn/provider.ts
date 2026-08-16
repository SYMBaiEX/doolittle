import {
  type ActionResult,
  ChannelType,
  createSessionEntry,
  extractSessionContext,
  type Media,
  type MessageMetadata,
  type SessionContext,
  type SessionEntry,
  type UUID,
} from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import { buildProviderRuntimeSettings } from "@/runtime/linked-provider-accounts";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import type { NativeMessagePolicy } from "./native/types";
import {
  type ModelSettingsSnapshot,
  type ProviderModelTurnExecutionContext,
  type ProviderTurnOptions,
  providerModelTurnContext,
} from "./provider/types";
import {
  executeProviderMessageTurn,
  type ProviderTurnSettingsSnapshot,
} from "./provider-handler";
import { createProviderStreamState } from "./provider-streaming";
import type { TurnState } from "./state";

function resolveSdkSessionKey(
  context: AgentExecutionContext,
  sessionId: string,
): string {
  try {
    return context.services.sessions.continuityKey(sessionId);
  } catch {
    return sessionId;
  }
}

function createSdkSessionEntry(input: {
  turn: TurnState;
  settingsDuring: ModelSettingsSnapshot;
}): SessionEntry {
  return createSessionEntry({
    sessionId: input.turn.sessionId,
    label: input.turn.sessionId,
    displayName: input.turn.sessionId,
    chatType: "dm",
    channel: input.turn.connectionSource,
    origin: {
      provider: "doolittle",
      surface: input.turn.localInteractive
        ? "cli"
        : input.turn.connectionSource,
      chatType: "dm",
    },
    modelProvider: input.settingsDuring.model.provider,
    model: input.settingsDuring.model.model,
    sendPolicy: "allow",
  });
}

function attachSdkSessionContext(input: {
  memory: ReturnType<ProviderModelTurnExecutionContext["createMessageMemory"]>;
  turn: TurnState;
  settingsDuring: ModelSettingsSnapshot;
  sessionKey: string;
  userId: string;
  effectiveMessage: string;
}): void {
  const sessionEntry = createSdkSessionEntry(input);
  const sessionContext: SessionContext &
    Pick<SessionEntry, "displayName" | "model" | "modelProvider" | "origin"> = {
    sessionId: sessionEntry.sessionId,
    sessionKey: input.sessionKey,
    isNewSession: false,
    updatedAt: sessionEntry.updatedAt,
    label: sessionEntry.label,
    sendPolicy: sessionEntry.sendPolicy,
    chatType: sessionEntry.chatType,
    channel: sessionEntry.channel,
    displayName: sessionEntry.displayName,
    model: sessionEntry.model,
    modelProvider: sessionEntry.modelProvider,
    origin: sessionEntry.origin,
  };
  const memoryRecord = input.memory as typeof input.memory & {
    sessionId?: string;
    sessionKey?: string;
  };

  memoryRecord.sessionId = input.turn.sessionId;
  memoryRecord.sessionKey = input.sessionKey;
  const metadata: MessageMetadata = {
    ...(input.memory.metadata ?? {}),
    type: "message",
    sessionId: input.turn.sessionId,
    sessionKey: input.sessionKey,
    session: sessionContext,
    doolittle: {
      userId: input.userId,
      rawMessage: input.effectiveMessage,
      source: input.turn.connectionSource,
    },
  };
  input.memory.metadata = metadata;

  extractSessionContext(input.memory);
}

export function createProviderMessageMemory(
  input: {
    context: AgentExecutionContext;
    turn: TurnState;
    userId: string;
    effectiveMessage: string;
    settingsDuring: ModelSettingsSnapshot;
    attachments?: Media[];
  },
  executionContext: ProviderModelTurnExecutionContext = providerModelTurnContext,
): ReturnType<ProviderModelTurnExecutionContext["createMessageMemory"]> {
  const memory = executionContext.createMessageMemory({
    id: input.turn.messageId as UUID,
    entityId: input.turn.entityId as UUID,
    roomId: input.turn.roomId as UUID,
    content: {
      text: input.effectiveMessage,
      source: input.turn.connectionSource,
      channelType: ChannelType.DM,
      attachments: input.attachments,
    },
  });
  const sessionKey = resolveSdkSessionKey(input.context, input.turn.sessionId);
  attachSdkSessionContext({
    memory,
    turn: input.turn,
    settingsDuring: input.settingsDuring,
    sessionKey,
    userId: input.userId,
    effectiveMessage: input.effectiveMessage,
  });
  return memory;
}

export async function runProviderModelTurn(
  input: {
    context: AgentExecutionContext;
    turn: TurnState;
    userId: string;
    effectiveMessage: string;
    settingsBefore: ModelSettingsSnapshot;
    settingsDuring: ModelSettingsSnapshot;
    messagePolicy: NativeMessagePolicy;
    options?: ProviderTurnOptions;
    attachments?: Media[];
  },
  executionContext: ProviderModelTurnExecutionContext = providerModelTurnContext,
): Promise<{
  handledMessage: boolean;
  response: string;
  runFailureMessage?: string;
  messageId: string;
  actionResults: ActionResult[];
  responseMessages: import("@elizaos/core").Memory[];
}> {
  const memory = createProviderMessageMemory(input, executionContext);
  const sessionKey =
    memory.sessionKey ??
    resolveSdkSessionKey(input.context, input.turn.sessionId);
  const runtimeSettings = buildProviderRuntimeSettings(
    input.context,
    input.settingsDuring,
  );
  runtimeSettings.set("ELIZAOS_CLOUD_CONVERSATION_ID", sessionKey);

  return runWithTurnRuntimeScope(
    input.context.runtime,
    {
      settings: runtimeSettings,
      abortSignal: input.options?.abortSignal,
      personalityId: input.options?.personalityId,
      commandHooks: {
        runLocalShellCommand: input.options?.runLocalShellCommand,
      },
    },
    async () => {
      let response = "";
      let handledMessage = false;
      let actionResults: ActionResult[] = [];
      let responseMessages: import("@elizaos/core").Memory[] = [];
      let messageId = String(memory.id);
      const streamState = createProviderStreamState({
        resolveStreamingUpdate: executionContext.resolveStreamingUpdate,
        extractCompatTextContent: executionContext.extractCompatTextContent,
        onResponseProgress: input.options?.onResponseProgress,
      });

      input.context.services.runController.updateThinking(input.turn.sessionId);
      const messageExecutionResult = await executeProviderMessageTurn({
        context: input.context,
        memory,
        sessionId: input.turn.sessionId,
        runId: input.turn.runId,
        streamState,
        messagePolicy: input.messagePolicy,
        abortSignal: input.options?.abortSignal,
        settingsDuring: input.settingsDuring as ProviderTurnSettingsSnapshot,
        onNotice: input.options?.onNotice,
        connectionSource: input.turn.connectionSource,
        roomId: input.turn.roomId,
        buildProviderFailureMessage:
          executionContext.buildProviderFailureMessage,
      });
      handledMessage = messageExecutionResult.handledMessage;
      const runFailureMessage = messageExecutionResult.runFailureMessage;
      response = messageExecutionResult.response;
      messageId = messageExecutionResult.messageId;
      actionResults = messageExecutionResult.actionResults;
      responseMessages = messageExecutionResult.responseMessages;

      return {
        handledMessage,
        response,
        runFailureMessage,
        messageId,
        actionResults,
        responseMessages,
      };
    },
  );
}
