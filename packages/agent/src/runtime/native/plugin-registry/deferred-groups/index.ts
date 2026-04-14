import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../../services";
import type { EnvConfig } from "../../../../types/runtime";
import { loadDeferredAutomationPlugins } from "./automation";
import { loadDeferredBrowserPlugins } from "./browser";
import { loadDeferredExecutionPlugins } from "./execution";
import { loadDeferredIntegrationPlugins } from "./integration";
import { loadDeferredKnowledgePlugins } from "./knowledge";
import { loadDeferredMediaPlugins } from "./media";
import { loadDeferredMessagingPlugins } from "./messaging";
import { loadDeferredResearchPlugins } from "./research";

export interface NativeDeferredPluginGroups {
  messaging: Plugin[];
  knowledge: Plugin[];
  browser: Plugin[];
  media: Plugin[];
  research: Plugin[];
  execution: Plugin[];
  integration: Plugin[];
  automation: Plugin[];
}

export function createEmptyDeferredPluginGroups(): NativeDeferredPluginGroups {
  return {
    messaging: [],
    knowledge: [],
    browser: [],
    media: [],
    research: [],
    execution: [],
    integration: [],
    automation: [],
  };
}

export async function loadDeferredPluginGroups(
  services: AppServices,
  config: EnvConfig,
): Promise<NativeDeferredPluginGroups> {
  const context = { services, config };
  const messaging = await loadDeferredMessagingPlugins(context);
  const knowledge = await loadDeferredKnowledgePlugins(context);
  const browser = await loadDeferredBrowserPlugins(context);
  const media = await loadDeferredMediaPlugins(context);
  const research = await loadDeferredResearchPlugins(context);
  const execution = await loadDeferredExecutionPlugins(context);
  const integration = await loadDeferredIntegrationPlugins(context);
  const automation = await loadDeferredAutomationPlugins(context);

  return {
    messaging,
    knowledge,
    browser,
    media,
    research,
    execution,
    integration,
    automation,
  };
}
