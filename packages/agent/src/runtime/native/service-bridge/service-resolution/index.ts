import type { RuntimeLike } from "../runtime";
import { getNativeServices } from "../runtime";
import { readNativePluginManagerInventory } from "./plugin-manager-inventory";
import { buildEffectiveServiceResolutionRecords } from "./records";
import type {
  EffectiveServiceResolutionRecord,
  NativePluginManagerSummary,
} from "./types";

export type {
  EffectiveToolDefinition,
  EffectiveToolInventory,
  EffectiveToolInventoryOptions,
  RuntimeToolProjection,
} from "./tool-inventory";
export {
  getEffectiveToolInventory,
  getRuntimeToolProjection,
  searchEffectiveTools,
  TOOL_POLICY_PROFILES,
} from "./tool-inventory";
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
  if (typeof runtime.getAllPluginOwnership !== "function") return null;
  return readNativePluginManagerInventory(runtime.getAllPluginOwnership());
}
