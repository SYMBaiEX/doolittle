import { randomUUID } from "node:crypto";
import { resolveStreamingUpdate } from "@elizaos/autonomous/api/streaming-text";
import {
  ChannelType,
  createMessageMemory,
  EventType,
  type UUID,
} from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import {
  buildProviderFailureMessage,
  syncProviderSettings,
} from "@/runtime/linked-provider-accounts";
import type { TurnCapabilityProfile } from "@/runtime/turn-classification";
import {
  type DirectLocalIntentFallbackLoader,
  executeProviderMessageTurn,
  type ProviderTurnSettingsSnapshot,
} from "./provider-handler";
import { createProviderStreamState } from "./provider-streaming";
import {
  buildNativePlanningFailureMessage,
  isRecoverableNativePlanningError,
} from "./response-shaping";
import type { TurnState } from "./state";
import { extractCompatTextContent } from "./state";

export type ModelSettingsSnapshot = ReturnType<
  AgentExecutionContext["services"]["settings"]["get"]
>;

type ProviderTurnOptions = AgentTurnHooks & {
  personalityId?: string;
};

type ProviderModelTurnExecutionContext = {
  resolveStreamingUpdate: typeof resolveStreamingUpdate;
  createMessageMemory: typeof createMessageMemory;
  extractCompatTextContent: typeof extractCompatTextContent;
  buildNativePlanningFailureMessage: typeof buildNativePlanningFailureMessage;
  isRecoverableNativePlanningError: typeof isRecoverableNativePlanningError;
  buildProviderFailureMessage: typeof buildProviderFailureMessage;
  syncProviderSettings: typeof syncProviderSettings;
};

const providerModelTurnContext: ProviderModelTurnExecutionContext = {
  resolveStreamingUpdate,
  createMessageMemory,
  extractCompatTextContent,
  buildNativePlanningFailureMessage,
  isRecoverableNativePlanningError,
  buildProviderFailureMessage,
  syncProviderSettings,
};

const providerRuntimeLocks = new WeakMap<object, Promise<void>>();

function hasModelOverride(
  before: ModelSettingsSnapshot,
  during: ModelSettingsSnapshot,
): boolean {
  return (
    during.model.provider !== before.model.provider ||
    during.model.model !== before.model.model ||
    during.model.baseUrl !== before.model.baseUrl ||
    during.model.temperature !== before.model.temperature ||
    during.model.maxTokens !== before.model.maxTokens
  );
}

function applyModelSettings(
  context: AgentExecutionContext,
  settings: ModelSettingsSnapshot,
  executionContext: ProviderModelTurnExecutionContext,
): void {
  context.services.settings.set("model.provider", settings.model.provider);
  context.services.settings.set("model.model", settings.model.model);
  context.services.settings.set("model.baseUrl", settings.model.baseUrl);
  context.services.settings.set(
    "model.temperature",
    settings.model.temperature,
  );
  context.services.settings.set("model.maxTokens", settings.model.maxTokens);
  executionContext.syncProviderSettings(
    context,
    context.services.settings.get(),
  );
}

function restoreRuntimeSetting(
  context: AgentExecutionContext,
  key: string,
  value: unknown,
): void {
  context.runtime.setSetting(
    key,
    typeof value === "string" || typeof value === "boolean" || value === null
      ? value
      : null,
  );
}

async function withProviderRuntimeLock<T>(
  runtime: AgentExecutionContext["runtime"],
  task: () => Promise<T>,
): Promise<T> {
  const previous = providerRuntimeLocks.get(runtime) ?? Promise.resolve();
  let release!: () => void;
  const completion = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => completion);
  providerRuntimeLocks.set(runtime, next);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (providerRuntimeLocks.get(runtime) === next) {
      providerRuntimeLocks.delete(runtime);
    }
  }
}

export async function runProviderModelTurn(
  input: {
    context: AgentExecutionContext;
    turn: TurnState;
    effectiveMessage: string;
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
  return withProviderRuntimeLock(input.context.runtime, async () => {
    let response = "";
    let handledMessage = false;
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
        input.context.services.sessions.continuityKey(input.turn.sessionId),
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
    };
  });
}
