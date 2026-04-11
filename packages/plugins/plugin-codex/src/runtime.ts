import type { IAgentRuntime } from "@elizaos/core";
import type { RuntimeModelSettings } from "./types";

export function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      model?: RuntimeModelSettings;
    };
    return parsed.model?.provider;
  } catch {
    return undefined;
  }
}

export function getRuntimeModelSettings(
  runtime: IAgentRuntime | undefined,
): RuntimeModelSettings {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: RuntimeModelSettings;
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}
