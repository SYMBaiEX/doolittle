import { join } from "node:path";
import type {
  PluginStorageBinding,
  PluginStorageOptions,
} from "@doolittle/contracts";

/** Runtime-owned plugin storage composition; contracts carry only the shape. */
export function bindPluginStorage(
  scope: string,
  options: PluginStorageOptions,
): PluginStorageBinding {
  const dataRoot = options.dataRoot.trim();
  if (!scope.trim() || !dataRoot) {
    throw new Error("Plugin storage requires an explicit scope and data root.");
  }
  return {
    dataRoot,
    scope,
    rootDir: join(dataRoot, scope),
  };
}
