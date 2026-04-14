import type { RuntimeLike } from "../runtime";
import { getNativeServices } from "../runtime";
import { buildDerivedPluginManagerSummary } from "./plugin-manager-summary";
import { buildEffectiveServiceResolutionRecords } from "./records";
import type {
  EffectiveServiceResolutionRecord,
  NativePluginManagerSummary,
} from "./types";

export type { EffectiveServiceResolutionRecord, NativePluginManagerSummary };

export function getEffectiveServiceResolution(
  runtime: RuntimeLike,
): EffectiveServiceResolutionRecord[] {
  return buildEffectiveServiceResolutionRecords(getNativeServices(runtime));
}

export function getEffectivePluginManagerInventory(runtime: RuntimeLike): {
  plugins: unknown[];
  categories: unknown;
  summary: NativePluginManagerSummary;
} | null {
  const pluginManager = getNativeServices(runtime).pluginManager;
  if (!pluginManager) {
    return null;
  }
  const plugins = pluginManager.list();
  const categories = pluginManager.categories();
  const summary =
    pluginManager.summary?.() ??
    buildDerivedPluginManagerSummary(plugins, categories);
  return {
    plugins,
    categories,
    summary,
  };
}
