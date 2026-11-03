import type { IAgentRuntime } from "@elizaos/core";

export interface ProviderRuntimeModelSettings {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: string;
}

function parseRuntimeModelSettings(
  runtime: IAgentRuntime | undefined,
): ProviderRuntimeModelSettings {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: ProviderRuntimeModelSettings;
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}

/** Read the active provider from Doolittle's shared runtime settings envelope. */
export function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  return parseRuntimeModelSettings(runtime).provider;
}

/** Read model overrides shared by linked prompt-only provider transports. */
export function getRuntimeModelSettings(
  runtime: IAgentRuntime | undefined,
): ProviderRuntimeModelSettings {
  return parseRuntimeModelSettings(runtime);
}
