import { createMessageMemory } from "@elizaos/core";
import { resolveStreamingUpdate } from "@elizaos/shared/utils/streaming-text";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import {
  buildProviderFailureMessage,
  syncProviderSettings,
} from "@/runtime/linked-provider-accounts";
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
  buildProviderFailureMessage: typeof buildProviderFailureMessage;
  syncProviderSettings: typeof syncProviderSettings;
};

export const providerModelTurnContext: ProviderModelTurnExecutionContext = {
  resolveStreamingUpdate,
  createMessageMemory,
  extractCompatTextContent,
  buildProviderFailureMessage,
  syncProviderSettings,
};
