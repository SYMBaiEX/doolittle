import { join } from "node:path";
import type { AppServices } from "../../../../services";
import type { EnvConfig } from "../../../../types/runtime";

export interface DeferredPluginGroupContext {
  services: AppServices;
  config: EnvConfig;
}

export function resolveDeferredPluginDataRoot(config: EnvConfig): string {
  return join(config.dataDir, "plugins");
}
