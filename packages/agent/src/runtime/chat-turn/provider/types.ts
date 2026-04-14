import { resolveStreamingUpdate } from "@elizaos/autonomous/api/streaming-text";
import { createMessageMemory } from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import {
  buildProviderFailureMessage,
  syncProviderSettings,
} from "@/runtime/linked-provider-accounts";
import {
  buildNativePlanningFailureMessage,
  isRecoverableNativePlanningError,
} from "../response-shaping";
import { extractCompatTextContent } from "../state";

export type ModelSettingsSnapshot = ReturnType<
  AgentExecutionContext["services"]["settings"]["get"]
>;

export type ProviderTurnOptions = AgentTurnHooks & {
  personalityId?: string;
};

export type ProviderModelTurnExecutionContext = {
  resolveStreamingUpdate: typeof resolveStreamingUpdate;
  createMessageMemory: typeof createMessageMemory;
  extractCompatTextContent: typeof extractCompatTextContent;
  buildNativePlanningFailureMessage: typeof buildNativePlanningFailureMessage;
  isRecoverableNativePlanningError: typeof isRecoverableNativePlanningError;
  buildProviderFailureMessage: typeof buildProviderFailureMessage;
  syncProviderSettings: typeof syncProviderSettings;
};

export const providerModelTurnContext: ProviderModelTurnExecutionContext = {
  resolveStreamingUpdate,
  createMessageMemory,
  extractCompatTextContent,
  buildNativePlanningFailureMessage,
  isRecoverableNativePlanningError,
  buildProviderFailureMessage,
  syncProviderSettings,
};
