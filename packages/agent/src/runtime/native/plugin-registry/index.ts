import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../services";
import type { EnvConfig } from "../../../types/runtime";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
  type NativePluginCatalog,
  type NativePluginCatalogGroups,
} from "../plugin-catalog";
import {
  createEmptyDeferredPluginGroups,
  loadDeferredPluginGroups,
} from "./deferred-groups";
import { loadFoundationPlugins } from "./foundation";
import { loadHotExecutionPlugins } from "./hot-execution";
import { loadHotIdentityPlugins } from "./hot-identity";
import { createDoolittleProductPlugin } from "./product";
import { loadProviderPlugins } from "./providers";

export interface NativePluginAssembly {
  catalog: NativePluginCatalog;
  groupedCatalog: NativePluginCatalogGroups;
  foundation: Plugin[];
  providers: Plugin[];
  messaging: Plugin[];
  identity: Plugin[];
  research: Plugin[];
  execution: Plugin[];
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
  const foundation = loadFoundationPlugins();
  const providers = await loadProviderPlugins(config);
  const identity = await loadHotIdentityPlugins(services);
  const execution = await loadHotExecutionPlugins(services, config);
  const product: Plugin[] = [createDoolittleProductPlugin(services, config)];
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
      identity,
      research: emptyDeferred.research,
      execution,
      product,
      initial,
      deferred: [],
      all: initial,
    };
  }

  const deferredGroups = await loadDeferredPluginGroups(services, config);
  const deferred = [
    ...deferredGroups.messaging,
    ...deferredGroups.research,
    ...deferredGroups.execution,
  ];
  const all = [...initial, ...deferred];

  return {
    catalog,
    groupedCatalog,
    foundation,
    providers,
    identity,
    messaging: deferredGroups.messaging,
    research: deferredGroups.research,
    execution: [...execution, ...deferredGroups.execution],
    product,
    initial,
    deferred,
    all,
  };
}
