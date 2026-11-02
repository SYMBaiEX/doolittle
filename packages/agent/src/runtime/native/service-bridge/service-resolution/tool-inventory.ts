import type { ToolProfileId } from "@elizaos/core";
import type { AppServices } from "../../../../services/index";
import type { ToolDefinition } from "../../../../types/index";
import type { RuntimeLike } from "../runtime";

export const TOOL_POLICY_PROFILES = [
  "full",
] as const satisfies readonly ToolProfileId[];

export interface EffectiveToolInventoryOptions {
  profile?: ToolProfileId;
}

export interface EffectiveToolDefinition extends ToolDefinition {
  source: "eliza-action";
  similes?: string[];
  allowedProfiles?: ToolProfileId[];
  policyReason?: string;
}

export interface EffectiveToolInventory {
  tools: EffectiveToolDefinition[];
  runtimeOwned: boolean;
  policyOwned: boolean;
  effectiveProfile: ToolProfileId;
  policyError?: string;
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    categories: Array<{ category: string; total: number; enabled: number }>;
    transports: Array<{ transport: string; total: number; enabled: number }>;
    runtimeOwned: boolean;
    policyOwned: boolean;
    effectiveProfile: ToolProfileId;
    profiles: Array<{
      profile: ToolProfileId;
      total: number;
      allowed: number;
      denied: number;
    }>;
    pluginTools: number;
    pluginGroups: Array<{ plugin: string; tools: number }>;
    policyError?: string;
    controlPlane: ReturnType<AppServices["tools"]["summary"]>;
  };
}

export interface RuntimeToolProjection {
  tools: EffectiveToolDefinition[];
  runtimeOwned: boolean;
  policyOwned: boolean;
  effectiveProfile: ToolProfileId;
  profiles: EffectiveToolInventory["summary"]["profiles"];
  pluginTools: number;
  pluginGroups: EffectiveToolInventory["summary"]["pluginGroups"];
  policyError?: string;
}

function titleFromActionName(name: string): string {
  return name
    .replace(/[_-]+/gu, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

function registeredActions(runtime: RuntimeLike): EffectiveToolDefinition[] {
  if (typeof runtime.getAllActions !== "function") {
    return [];
  }
  const seen = new Set<string>();
  const tools: EffectiveToolDefinition[] = [];
  for (const action of runtime.getAllActions()) {
    const name = String(action.name ?? "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const similes = Array.isArray(action.similes)
      ? action.similes.filter(
          (simile): simile is string =>
            typeof simile === "string" && Boolean(simile.trim()),
        )
      : [];
    tools.push({
      id: name,
      name: titleFromActionName(name),
      category: "runtime",
      description:
        typeof action.description === "string" && action.description.trim()
          ? action.description.trim()
          : `Eliza runtime action ${name}.`,
      enabled: true,
      transport: "native",
      source: "eliza-action",
      ...(similes.length ? { similes } : {}),
    });
  }
  return tools;
}

interface ToolPolicyProjection {
  tools: EffectiveToolDefinition[];
  policyOwned: boolean;
  profiles: EffectiveToolInventory["summary"]["profiles"];
  pluginTools: number;
  pluginGroups: EffectiveToolInventory["summary"]["pluginGroups"];
  policyError?: string;
}

function configuredToolProfile(runtime: RuntimeLike): ToolProfileId {
  const profile = runtime.character?.settings?.toolProfile;
  if (profile !== undefined && profile !== "full")
    throw new Error(
      "Static tool profiles were retired by ElizaOS. Action authority is evaluated for each request.",
    );
  return "full";
}

function projectToolPolicy(
  runtime: RuntimeLike,
  tools: EffectiveToolDefinition[],
  profile: ToolProfileId,
): ToolPolicyProjection {
  if (profile !== "full")
    throw new Error("Static tool profiles were retired by ElizaOS.");
  const groups =
    runtime.getAllPluginOwnership?.().map((entry) => ({
      plugin: entry.pluginName,
      tools: entry.actions.length,
    })) ?? [];
  return {
    tools,
    policyOwned: false,
    profiles: [],
    pluginTools: groups.reduce((sum, group) => sum + group.tools, 0),
    pluginGroups: groups,
  };
}

function summarize(
  tools: EffectiveToolDefinition[],
  runtimeOwned: boolean,
  policy: Pick<
    ToolPolicyProjection,
    "policyOwned" | "profiles" | "pluginTools" | "pluginGroups" | "policyError"
  >,
  effectiveProfile: ToolProfileId,
  controlPlane: ReturnType<AppServices["tools"]["summary"]>,
): EffectiveToolInventory["summary"] {
  const enabled = tools.filter((tool) => tool.enabled);
  const group = (field: "category" | "transport") => {
    const grouped = new Map<string, EffectiveToolDefinition[]>();
    for (const tool of tools) {
      const key =
        field === "transport" ? (tool.transport ?? "service") : tool.category;
      grouped.set(key, [...(grouped.get(key) ?? []), tool]);
    }
    return [...grouped.entries()].map(([name, entries]) => ({
      [field]: name,
      total: entries.length,
      enabled: entries.filter((tool) => tool.enabled).length,
    }));
  };
  return {
    total: tools.length,
    enabled: enabled.length,
    disabled: tools.length - enabled.length,
    categories: group(
      "category",
    ) as EffectiveToolInventory["summary"]["categories"],
    transports: group(
      "transport",
    ) as EffectiveToolInventory["summary"]["transports"],
    runtimeOwned,
    policyOwned: policy.policyOwned,
    effectiveProfile,
    profiles: policy.profiles,
    pluginTools: policy.pluginTools,
    pluginGroups: policy.pluginGroups,
    ...(policy.policyError ? { policyError: policy.policyError } : {}),
    controlPlane,
  };
}

export function getEffectiveToolInventory(
  runtime: RuntimeLike,
  services: AppServices,
  options: EffectiveToolInventoryOptions = {},
): EffectiveToolInventory {
  const projection = getRuntimeToolProjection(runtime, options);
  const controlPlane = services.tools.summary();
  return {
    tools: projection.tools,
    runtimeOwned: projection.runtimeOwned,
    policyOwned: projection.policyOwned,
    effectiveProfile: projection.effectiveProfile,
    ...(projection.policyError ? { policyError: projection.policyError } : {}),
    summary: summarize(
      projection.tools,
      projection.runtimeOwned,
      projection,
      projection.effectiveProfile,
      controlPlane,
    ),
  };
}

/**
 * Project registered Eliza actions from the kernel without consulting
 * Doolittle's product capability catalog. Protocol adapters use this projection
 * to avoid owning a second tool registry or recursing through their own status.
 */
export function getRuntimeToolProjection(
  runtime: RuntimeLike,
  options: EffectiveToolInventoryOptions = {},
): RuntimeToolProjection {
  const runtimeTools = registeredActions(runtime);
  const runtimeOwned = typeof runtime.getAllActions === "function";
  const effectiveProfile = options.profile ?? configuredToolProfile(runtime);
  const policy = projectToolPolicy(runtime, runtimeTools, effectiveProfile);
  return {
    tools: policy.tools,
    runtimeOwned,
    policyOwned: policy.policyOwned,
    effectiveProfile,
    profiles: policy.profiles,
    pluginTools: policy.pluginTools,
    pluginGroups: policy.pluginGroups,
    ...(policy.policyError ? { policyError: policy.policyError } : {}),
  };
}

export function searchEffectiveTools(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  options: EffectiveToolInventoryOptions = {},
): EffectiveToolDefinition[] {
  const normalized = query.trim().toLowerCase();
  const tools = getEffectiveToolInventory(runtime, services, options).tools;
  if (!normalized) return tools;
  return tools.filter((tool) =>
    [
      tool.id,
      tool.name,
      tool.category,
      tool.description,
      tool.transport ?? "",
      ...(tool.similes ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}
