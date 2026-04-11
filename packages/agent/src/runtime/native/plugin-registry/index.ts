import type { Plugin } from "@elizaos/core";
import { createDoolittlePlugin } from "@plugins/doolittle-plugin";
import type { AppServices } from "../../../services";
import type { EnvConfig } from "../../../types/runtime";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
  type NativePluginCatalog,
  type NativePluginCatalogGroups,
} from "../plugin-catalog/index";
import {
  createEmptyDeferredPluginGroups,
  loadDeferredPluginGroups,
} from "./deferred-groups";
import { loadHotExecutionPlugins } from "./hot-execution";
import { loadHotIdentityPlugins } from "./hot-identity";
import { loadProviderPlugins } from "./providers";

export { shouldIncludeDirectProviderPlugin } from "./support";

export interface NativePluginAssembly {
  catalog: NativePluginCatalog;
  groupedCatalog: NativePluginCatalogGroups;
  foundation: Plugin[];
  providers: Plugin[];
  messaging: Plugin[];
  knowledge: Plugin[];
  browser: Plugin[];
  media: Plugin[];
  research: Plugin[];
  execution: Plugin[];
  integration: Plugin[];
  automation: Plugin[];
  product: Plugin[];
  initial: Plugin[];
  deferred: Plugin[];
  all: Plugin[];
}

export interface NativePluginAssemblyOptions {
  hotOnly?: boolean;
}

export async function buildNativePluginAssembly(
  services: AppServices,
  config: EnvConfig,
  options: NativePluginAssemblyOptions = {},
): Promise<NativePluginAssembly> {
  const catalog = getNativePluginCatalog(config);
  const groupedCatalog = groupNativePluginCatalog(catalog);
  const foundation: Plugin[] = [];
  const providers = await loadProviderPlugins(services, config);
  const identity = await loadHotIdentityPlugins(services);
  const execution = await loadHotExecutionPlugins(
    services,
    config,
    catalog,
    groupedCatalog,
  );
  const product: Plugin[] = [createDoolittlePlugin({ services, config })];
  const initial = [
    ...foundation,
    ...providers,
    ...identity,
    ...execution,
    ...product,
  ];

  const emptyDeferred = createEmptyDeferredPluginGroups();

  if (options.hotOnly) {
    return {
      catalog,
      groupedCatalog,
      foundation,
      providers,
      messaging: emptyDeferred.messaging,
      knowledge: identity,
      browser: emptyDeferred.browser,
      media: emptyDeferred.media,
      research: emptyDeferred.research,
      execution,
      integration: emptyDeferred.integration,
      automation: emptyDeferred.automation,
      product,
      initial,
      deferred: [],
      all: initial,
    };
  }

  const deferredGroups = await loadDeferredPluginGroups(services, config);
  const deferred = [
    ...deferredGroups.messaging,
    ...deferredGroups.knowledge,
    ...deferredGroups.browser,
    ...deferredGroups.media,
    ...deferredGroups.research,
    ...deferredGroups.execution,
    ...deferredGroups.integration,
    ...deferredGroups.automation,
  ];

  return {
    catalog,
    groupedCatalog,
    foundation,
    providers,
    knowledge: [...identity, ...deferredGroups.knowledge],
    messaging: deferredGroups.messaging,
    browser: deferredGroups.browser,
    media: deferredGroups.media,
    research: deferredGroups.research,
    execution: [...execution, ...deferredGroups.execution],
    integration: deferredGroups.integration,
    automation: deferredGroups.automation,
    product,
    initial,
    deferred,
    all: [...initial, ...deferred],
  };
}
