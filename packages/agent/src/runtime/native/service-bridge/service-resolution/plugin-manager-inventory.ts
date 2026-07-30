import type { NativePluginManagerService } from "../runtime-contracts";
import { buildDerivedPluginManagerSummary } from "./plugin-manager-summary";
import type { NativePluginManagerSummary } from "./types";

interface RuntimePluginState {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  plugin?: unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeRuntimePluginState(value: unknown) {
  const state = value as RuntimePluginState;
  const plugin = record(state.plugin);
  const name =
    text(state.name) ??
    text(plugin?.name) ??
    text(state.id) ??
    "unknown-plugin";
  const status = text(state.status) ?? "loaded";
  const source =
    name === "elizaos" || name.startsWith("@elizaos/")
      ? "official"
      : "vendored";

  return {
    id: text(state.id) ?? name,
    name,
    status,
    enabled: status === "ready" || status === "loaded",
    source,
    description: text(plugin?.description),
    actions: Array.isArray(plugin?.actions) ? plugin.actions.length : 0,
    providers: Array.isArray(plugin?.providers) ? plugin.providers.length : 0,
    services: Array.isArray(plugin?.services) ? plugin.services.length : 0,
  };
}

function groupRuntimePlugins(
  plugins: ReturnType<typeof normalizeRuntimePluginState>[],
) {
  return {
    official: plugins.filter((plugin) => plugin.source === "official").length,
    vendored: plugins.filter((plugin) => plugin.source === "vendored").length,
  };
}

export function readNativePluginManagerInventory(
  pluginManager: NativePluginManagerService,
): {
  plugins: unknown[];
  categories: unknown;
  summary: NativePluginManagerSummary;
} {
  const runtimePlugins = pluginManager.getAllPlugins?.();
  const plugins = runtimePlugins
    ? runtimePlugins.map(normalizeRuntimePluginState)
    : (pluginManager.list?.() ?? []);
  const categories =
    pluginManager.categories?.() ??
    groupRuntimePlugins(
      runtimePlugins
        ? (plugins as ReturnType<typeof normalizeRuntimePluginState>[])
        : [],
    );

  return {
    plugins,
    categories,
    summary:
      pluginManager.summary?.() ??
      buildDerivedPluginManagerSummary(plugins, categories),
  };
}
