import type { RuntimeLike } from "./runtime";
import { getNativeServices } from "./runtime";
import type { NativePluginManagerService } from "./runtime-contracts";

export interface EffectiveServiceResolutionRecord {
  capability: string;
  nativeService: string;
  source: "native" | "product";
  ownership: "plugin" | "product";
  fallback: string;
  available: boolean;
}

export interface NativePluginManagerSummary {
  total: number;
  enabled: number;
  official: number;
  vendored: number;
  categories: number;
}

function resolveOwnership(nativeService: unknown): "plugin" | "product" {
  return nativeService ? "plugin" : "product";
}

export function getEffectiveServiceResolution(
  runtime: RuntimeLike,
): EffectiveServiceResolutionRecord[] {
  const native = getNativeServices(runtime) as {
    knowledge?: unknown;
    personality?: unknown;
    rolodex?: unknown;
    experience?: unknown;
    shell?: unknown;
    browser?: unknown;
    mcp?: unknown;
    cron?: unknown;
    agentSkills?: unknown;
    trajectoryLogger?: unknown;
    agentOrchestrator?: unknown;
    codingAgent?: unknown;
    pluginManager?: unknown;
  };
  return [
    {
      capability: "knowledge",
      nativeService: "knowledge",
      source: native.knowledge ? "native" : "product",
      ownership: resolveOwnership(native.knowledge),
      fallback: "documents + memory + sessions",
      available: Boolean(native.knowledge),
    },
    {
      capability: "personality",
      nativeService: "personality",
      source: native.personality ? "native" : "product",
      ownership: resolveOwnership(native.personality),
      fallback: "personalities",
      available: Boolean(native.personality),
    },
    {
      capability: "rolodex",
      nativeService: "rolodex",
      source: native.rolodex ? "native" : "product",
      ownership: resolveOwnership(native.rolodex),
      fallback: "userProfiles",
      available: Boolean(native.rolodex),
    },
    {
      capability: "experience",
      nativeService: "experience",
      source: native.experience ? "native" : "product",
      ownership: resolveOwnership(native.experience),
      fallback: "sessions + memory",
      available: Boolean(native.experience),
    },
    {
      capability: "shell",
      nativeService: "shell",
      source: native.shell ? "native" : "product",
      ownership: resolveOwnership(native.shell),
      fallback: "terminal",
      available: Boolean(native.shell),
    },
    {
      capability: "browser",
      nativeService: "browser",
      source: native.browser ? "native" : "product",
      ownership: resolveOwnership(native.browser),
      fallback: "web",
      available: Boolean(native.browser),
    },
    {
      capability: "mcp",
      nativeService: "mcp",
      source: native.mcp ? "native" : "product",
      ownership: resolveOwnership(native.mcp),
      fallback: "mcp",
      available: Boolean(native.mcp),
    },
    {
      capability: "cron",
      nativeService: "cron",
      source: native.cron ? "native" : "product",
      ownership: resolveOwnership(native.cron),
      fallback: "cron",
      available: Boolean(native.cron),
    },
    {
      capability: "agentSkills",
      nativeService: "agent_skills",
      source: native.agentSkills ? "native" : "product",
      ownership: resolveOwnership(native.agentSkills),
      fallback: "skills + skillSynthesis",
      available: Boolean(native.agentSkills),
    },
    {
      capability: "trajectoryLogger",
      nativeService: "trajectory_logger",
      source: native.trajectoryLogger ? "native" : "product",
      ownership: resolveOwnership(native.trajectoryLogger),
      fallback: "trajectories",
      available: Boolean(native.trajectoryLogger),
    },
    {
      capability: "agentOrchestrator",
      nativeService: "agent_orchestrator",
      source: native.agentOrchestrator ? "native" : "product",
      ownership: resolveOwnership(native.agentOrchestrator),
      fallback: "delegation",
      available: Boolean(native.agentOrchestrator),
    },
    {
      capability: "codingAgent",
      nativeService: "coding_agent",
      source: native.codingAgent ? "native" : "product",
      ownership: resolveOwnership(native.codingAgent),
      fallback: "workspace + repository + terminal + delegation",
      available: Boolean(native.codingAgent),
    },
    {
      capability: "pluginManager",
      nativeService: "plugin_manager",
      source: native.pluginManager ? "native" : "product",
      ownership: resolveOwnership(native.pluginManager),
      fallback: "native plugin catalog",
      available: Boolean(native.pluginManager),
    },
  ];
}

export function getEffectivePluginManagerInventory(runtime: RuntimeLike): {
  plugins: unknown[];
  categories: unknown;
  summary: NativePluginManagerSummary;
} | null {
  const pluginManager = getNativeServices(runtime).pluginManager as
    | NativePluginManagerService
    | undefined;
  if (!pluginManager) {
    return null;
  }
  const plugins = pluginManager.list();
  const categories = pluginManager.categories();
  const summary = pluginManager.summary?.() ?? {
    total: Array.isArray(plugins) ? plugins.length : 0,
    enabled: Array.isArray(plugins)
      ? plugins.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            "enabled" in entry &&
            Boolean((entry as { enabled?: unknown }).enabled),
        ).length
      : 0,
    official: Array.isArray(plugins)
      ? plugins.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            "source" in entry &&
            (entry as { source?: unknown }).source === "official",
        ).length
      : 0,
    vendored: Array.isArray(plugins)
      ? plugins.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            "source" in entry &&
            (entry as { source?: unknown }).source === "vendored",
        ).length
      : 0,
    categories:
      categories && typeof categories === "object"
        ? Object.keys(categories as Record<string, unknown>).length
        : 0,
  };
  return {
    plugins,
    categories,
    summary,
  };
}
