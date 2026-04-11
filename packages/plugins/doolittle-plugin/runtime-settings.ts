import type { IAgentRuntime } from "@elizaos/core";
import type { RuntimeModelSettings } from "./types";

interface RuntimeSettings {
  model?: RuntimeModelSettings;
}

export function readRuntimeModelSettings(
  runtime: IAgentRuntime,
): RuntimeModelSettings | undefined {
  const runtimeSettingsRaw = runtime.getSetting("runtimeSettings");
  if (typeof runtimeSettingsRaw !== "string") {
    return undefined;
  }

  const runtimeSettings = JSON.parse(runtimeSettingsRaw) as RuntimeSettings;
  return runtimeSettings.model;
}
