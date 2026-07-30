import type { ToolProfileId } from "@elizaos/core";
import type { AppServices } from "@/services";
import type { ToolDefinition } from "@/types";
import type { RuntimeLike } from "../runtime";
import { getNativeServices } from "../runtime";

export const TOOL_POLICY_PROFILES = [
  "minimal",
  "coding",
  "messaging",
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
    policyError?: string;
    controlPlane: ReturnType<AppServices["tools"]["summary"]>;
  };
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
  policyError?: string;
}

function normalizeToolNames(names: string[]): Set<string> {
  return new Set(
    names.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
}

function projectToolPolicy(
  runtime: RuntimeLike,
  tools: EffectiveToolDefinition[],
  effectiveProfile: ToolProfileId,
): ToolPolicyProjection {
  const policy = getNativeServices(runtime).toolPolicy;
  if (typeof policy?.getAllowedTools !== "function") {
    return {
      tools,
      policyOwned: false,
      profiles: [],
    };
  }

  const names = tools.map((tool) => tool.id);
  try {
    const allowedByProfile = new Map<ToolProfileId, Set<string>>();
    for (const profile of TOOL_POLICY_PROFILES) {
      allowedByProfile.set(
        profile,
        normalizeToolNames(policy.getAllowedTools({ profile }, names)),
      );
    }

    const deniedReasons = new Map<string, string>();
    if (typeof policy.getDeniedTools === "function") {
      for (const denial of policy.getDeniedTools(
        { profile: effectiveProfile },
        names,
      )) {
        const name = denial.name.trim().toLowerCase();
        const reason = denial.reason.trim();
        if (name && reason) {
          deniedReasons.set(name, reason);
        }
      }
    }

    const effectiveAllowed =
      allowedByProfile.get(effectiveProfile) ?? new Set<string>();
    return {
      tools: tools.map((tool) => {
        const key = tool.id.toLowerCase();
        const allowedProfiles = TOOL_POLICY_PROFILES.filter((profile) =>
          allowedByProfile.get(profile)?.has(key),
        );
        const enabled = effectiveAllowed.has(key);
        return {
          ...tool,
          enabled,
          allowedProfiles,
          ...(!enabled && deniedReasons.has(key)
            ? { policyReason: deniedReasons.get(key) }
            : {}),
        };
      }),
      policyOwned: true,
      profiles: TOOL_POLICY_PROFILES.map((profile) => {
        const allowed = allowedByProfile.get(profile)?.size ?? 0;
        return {
          profile,
          total: tools.length,
          allowed,
          denied: tools.length - allowed,
        };
      }),
    };
  } catch (error) {
    return {
      tools,
      policyOwned: false,
      profiles: [],
      policyError: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(
  tools: EffectiveToolDefinition[],
  runtimeOwned: boolean,
  policy: Pick<
    ToolPolicyProjection,
    "policyOwned" | "profiles" | "policyError"
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
    ...(policy.policyError ? { policyError: policy.policyError } : {}),
    controlPlane,
  };
}

export function getEffectiveToolInventory(
  runtime: RuntimeLike,
  services: AppServices,
  options: EffectiveToolInventoryOptions = {},
): EffectiveToolInventory {
  const runtimeTools = registeredActions(runtime);
  const runtimeOwned = typeof runtime.getAllActions === "function";
  const effectiveProfile = options.profile ?? "full";
  const policy = projectToolPolicy(runtime, runtimeTools, effectiveProfile);
  const controlPlane = services.tools.summary();
  return {
    tools: policy.tools,
    runtimeOwned,
    policyOwned: policy.policyOwned,
    effectiveProfile,
    ...(policy.policyError ? { policyError: policy.policyError } : {}),
    summary: summarize(
      policy.tools,
      runtimeOwned,
      policy,
      effectiveProfile,
      controlPlane,
    ),
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
