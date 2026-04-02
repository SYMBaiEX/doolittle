import type { IAgentRuntime } from "@elizaos/core";

export function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      model?: { provider?: string };
    };
    return parsed.model?.provider;
  } catch {
    return undefined;
  }
}

export function getRuntimeModelSettings(runtime: IAgentRuntime | undefined): {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
} {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: {
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
      };
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}
