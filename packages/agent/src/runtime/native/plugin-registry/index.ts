import type { BotDefinition } from "@doolittle/contracts/bots";
import type { AppServices } from "../../../services";
import type { EnvConfig } from "../../../types/runtime";
import { getNativePluginCatalog } from "../plugin-catalog";
import { loadFoundationPlugins } from "./foundation";
import { loadHotExecutionPlugins } from "./hot-execution";
import { loadHotIdentityPlugins } from "./hot-identity";
import { createDoolittleProductPlugin } from "./product";
import { loadProviderPlugins } from "./providers";

export async function buildNativePluginAssembly(
  services: AppServices,
  config: EnvConfig,
  workerBot: BotDefinition | null,
) {
  const [providers, identity, execution] = await Promise.all([
    loadProviderPlugins(config, workerBot),
    loadHotIdentityPlugins(services),
    workerBot ? [] : loadHotExecutionPlugins(services, config),
  ]);
  return {
    catalog: getNativePluginCatalog(config),
    initial: [
      ...loadFoundationPlugins(Boolean(workerBot)),
      ...providers,
      ...identity,
      ...execution,
      createDoolittleProductPlugin(services, config, workerBot),
    ],
  };
}
