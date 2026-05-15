import { randomUUID } from "node:crypto";
import {
  type ActionResult,
  ChannelType,
  createSessionEntry,
  EventType,
  extractSessionContext,
  type SessionEntry,
  type UUID,
} from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { TurnCapabilityProfile } from "@/runtime/turn-classification/types";
import { withProviderRuntimeLock } from "./provider/lock";
import {
  applyModelSettings,
  hasModelOverride,
  restoreRuntimeSetting,
} from "./provider/settings";
import {
  type ModelSettingsSnapshot,
  type ProviderModelTurnExecutionContext,
  type ProviderTurnOptions,
  providerModelTurnContext,
} from "./provider/types";
import {
  type DirectLocalIntentFallbackLoader,
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
  messagePrelude?: string;
  effectiveMessage: string;
}): void {
  const sessionEntry = createSdkSessionEntry(input);
  const memoryRecord = input.memory as typeof input.memory & {
    sessionId?: string;
    sessionKey?: string;
  };

  memoryRecord.sessionId = input.turn.sessionId;
  memoryRecord.sessionKey = input.sessionKey;
  input.memory.metadata = {
    ...(input.memory.metadata ?? {}),
    sessionId: input.turn.sessionId,
    sessionKey: input.sessionKey,
    session: sessionEntry,
    doolittle: {
      messagePrelude: input.messagePrelude ?? "",
      rawMessage: input.effectiveMessage,
    },
  } as unknown as typeof input.memory.metadata;

  extractSessionContext(input.memory);
}

export async function runProviderModelTurn(
  input: {
    context: AgentExecutionContext;
    turn: TurnState;
    effectiveMessage: string;
    messagePrelude?: string;
    settingsBefore: ModelSettingsSnapshot;
    settingsDuring: ModelSettingsSnapshot;
    capabilityProfile: TurnCapabilityProfile;
    derivedTurnPolicy: {
      useMultiStep: boolean;
      maxIterations: number;
    };
    options?: ProviderTurnOptions;
    loadDirectLocalIntent: DirectLocalIntentFallbackLoader;
  },
  executionContext: ProviderModelTurnExecutionContext = providerModelTurnContext,
): Promise<{
  handledMessage: boolean;
  response: string;
  runFailureMessage?: string;
  messageId: string;
  actionResults: ActionResult[];
}> {
  const memory = executionContext.createMessageMemory({
    id: randomUUID() as UUID,
    entityId: input.turn.entityId as UUID,
    roomId: input.turn.roomId as UUID,
    content: {
      text: input.effectiveMessage,
      source: input.turn.connectionSource,
      channelType: ChannelType.DM,
    },
  });
  const sessionKey = resolveSdkSessionKey(input.context, input.turn.sessionId);
  attachSdkSessionContext({
    memory,
    turn: input.turn,
    settingsDuring: input.settingsDuring,
    sessionKey,
    messagePrelude: input.messagePrelude,
    effectiveMessage: input.effectiveMessage,
  });
  return withProviderRuntimeLock(input.context.runtime, async () => {
    let response = "";
    let handledMessage = false;
    let actionResults: ActionResult[] = [];
    let messageId = String(memory.id);
    const personalityBefore = input.context.services.personalities.getActive();
    const previousToolProfile = input.context.runtime.getSetting(
      "DOOLITTLE_TOOL_PROFILE",
    );
    const previousConversationId = input.context.runtime.getSetting(
      "ELIZAOS_CLOUD_CONVERSATION_ID",
    );
    const hasOverride = hasModelOverride(
      input.settingsBefore,
      input.settingsDuring,
    );

    if (hasOverride) {
      applyModelSettings(input.context, input.settingsDuring, executionContext);
    }

    if (
      input.options?.personalityId &&
      input.options.personalityId !== personalityBefore.id
    ) {
      input.context.services.personalities.setActive(
        input.options.personalityId,
      );
    }

    const streamState = createProviderStreamState({
      resolveStreamingUpdate: executionContext.resolveStreamingUpdate,
      extractCompatTextContent: executionContext.extractCompatTextContent,
      onResponseProgress: input.options?.onResponseProgress,
    });

    try {
      input.context.runtime.setSetting(
        "DOOLITTLE_TOOL_PROFILE",
        input.capabilityProfile,
      );
      input.context.runtime.setSetting(
        "ELIZAOS_CLOUD_CONVERSATION_ID",
        sessionKey,
      );
      if (typeof input.context.runtime.emitEvent === "function") {
        await input.context.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
          runtime: input.context.runtime,
          message: memory,
          source: input.turn.connectionSource,
        });
      }
    } catch (error) {
      input.context.runtime.logger?.warn(
        {
          error,
          roomId: input.turn.roomId,
          source: input.turn.connectionSource,
        },
        "Failed to emit MESSAGE_RECEIVED event for local turn",
      );
    }

    let runFailureMessage: string | undefined;

    try {
      input.context.services.runController.updateThinking(input.turn.sessionId);
      const messageExecutionResult = await executeProviderMessageTurn({
        context: input.context,
        memory,
        sessionId: input.turn.sessionId,
        runId: input.turn.runId,
        streamState,
        derivedTurnPolicy: input.derivedTurnPolicy,
        abortSignal: input.options?.abortSignal,
        settingsDuring: input.settingsDuring as ProviderTurnSettingsSnapshot,
        loadDirectLocalIntent: input.loadDirectLocalIntent,
        onNotice: input.options?.onNotice,
        connectionSource: input.turn.connectionSource,
        roomId: input.turn.roomId,
        buildProviderFailureMessage:
          executionContext.buildProviderFailureMessage,
        buildNativePlanningFailureMessage:
          executionContext.buildNativePlanningFailureMessage,
        isRecoverableNativePlanningError:
          executionContext.isRecoverableNativePlanningError,
      });
      handledMessage = messageExecutionResult.handledMessage;
      runFailureMessage = messageExecutionResult.runFailureMessage;
      response = messageExecutionResult.response;
      messageId = messageExecutionResult.messageId;
      actionResults = messageExecutionResult.actionResults;
    } finally {
      if (hasOverride) {
        applyModelSettings(
          input.context,
          input.settingsBefore,
          executionContext,
        );
      }

      if (
        input.options?.personalityId &&
        input.options.personalityId !== personalityBefore.id
      ) {
        input.context.services.personalities.setActive(personalityBefore.id);
      }

      restoreRuntimeSetting(
        input.context,
        "DOOLITTLE_TOOL_PROFILE",
        previousToolProfile,
      );
      restoreRuntimeSetting(
        input.context,
        "ELIZAOS_CLOUD_CONVERSATION_ID",
        previousConversationId,
      );
    }

    return {
      handledMessage,
      response,
      runFailureMessage,
      messageId,
      actionResults,
    };
  });
}
