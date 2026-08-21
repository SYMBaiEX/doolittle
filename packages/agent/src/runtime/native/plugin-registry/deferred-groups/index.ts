import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../../services";
import type { EnvConfig } from "../../../../types/runtime";
import { loadDeferredExecutionPlugins } from "./execution";
import { loadDeferredMessagingPlugins } from "./messaging";
import { loadDeferredResearchPlugins } from "./research";

export interface NativeDeferredPluginGroups {
  messaging: Plugin[];
  research: Plugin[];
  execution: Plugin[];
}

export function createEmptyDeferredPluginGroups(): NativeDeferredPluginGroups {
  return {
    messaging: [],
    research: [],
    execution: [],
  };
}

export async function loadDeferredPluginGroups(
  services: AppServices,
  config: EnvConfig,
): Promise<NativeDeferredPluginGroups> {
  const context = { services, config };
  const [messaging, execution] = await Promise.all([
    loadDeferredMessagingPlugins(context),
    loadDeferredExecutionPlugins(context),
  ]);
  const research = loadDeferredResearchPlugins(context);

  return {
    messaging,
    research,
    execution,
  };
}
