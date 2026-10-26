import type { EnvConfig } from "../../../types/runtime/index";
import { summarizeAutonomousConnection } from "./connection-summary";
import {
  autonomousFoundationPackages,
  autonomousNativeControlPlanes,
  autonomousPatternAreas,
} from "./constants";

export function describeAutonomousAlignment(config?: EnvConfig) {
  return {
    foundationPackages: [...autonomousFoundationPackages],
    patternAreas: [...autonomousPatternAreas],
    nativeControlPlanes: [...autonomousNativeControlPlanes],
    pluginAutoEnable: {
      allow: [
        config?.telegramBotToken ? "@elizaos/plugin-telegram" : undefined,
        config?.discordBotToken ? "@elizaos/plugin-discord" : undefined,
        config?.elizaCloudEnabled ? "@elizaos/plugin-elizacloud" : undefined,
      ].filter((name): name is string => Boolean(name)),
      changes: [] as unknown[],
    },
    connection: summarizeAutonomousConnection(config),
  };
}
