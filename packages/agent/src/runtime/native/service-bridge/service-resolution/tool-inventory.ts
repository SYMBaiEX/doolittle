import type { AppServices } from "@/services";
import type { ToolDefinition } from "@/types";
import type { RuntimeLike } from "../runtime";

export interface EffectiveToolDefinition extends ToolDefinition {
  source: "eliza-action" | "product-fallback";
  similes?: string[];
}

export interface EffectiveToolInventory {
  tools: EffectiveToolDefinition[];
  runtimeOwned: boolean;
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    categories: Array<{ category: string; total: number; enabled: number }>;
    transports: Array<{ transport: string; total: number; enabled: number }>;
    runtimeOwned: boolean;
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

function productFallback(services: AppServices): EffectiveToolDefinition[] {
  return services.tools.list().map((tool) => ({
    ...tool,
    source: "product-fallback" as const,
  }));
}

function summarize(
  tools: EffectiveToolDefinition[],
  runtimeOwned: boolean,
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
    controlPlane,
  };
}

export function getEffectiveToolInventory(
  runtime: RuntimeLike,
  services: AppServices,
): EffectiveToolInventory {
  const runtimeTools = registeredActions(runtime);
  const runtimeOwned = runtimeTools.length > 0;
  const tools = runtimeOwned ? runtimeTools : productFallback(services);
  const controlPlane = services.tools.summary();
  return {
    tools,
    runtimeOwned,
    summary: summarize(tools, runtimeOwned, controlPlane),
  };
}

export function searchEffectiveTools(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
): EffectiveToolDefinition[] {
  const normalized = query.trim().toLowerCase();
  const tools = getEffectiveToolInventory(runtime, services).tools;
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
