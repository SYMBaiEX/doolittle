import { type IAgentRuntime, ModelType, type Plugin } from "@elizaos/core";

export const PLANNER_TOOL_EXPOSURE_FLAG = "DOOLITTLE_PLANNER_DEDUP_ALIAS_TOOLS";
export const PLANNER_TOOL_EXPOSURE_HOOK_ID = "doolittle-planner-tool-exposure";
const MISSING = Symbol("missing own data");
const TERMINALS = new Set(["REPLY", "IGNORE", "STOP"]);
const TOOL_KEYS = new Set([
  "name",
  "description",
  "type",
  "strict",
  "parameters",
]);

function own(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : MISSING;
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Matches installed sub-planner lookup normalization, not a naming heuristic.
function identifier(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function dataArray(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return;
  const length = own(value, "length");
  if (typeof length !== "number") return;
  const entries: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const entry = own(value, index);
    if (entry === MISSING) return;
    entries.push(entry);
  }
  return entries;
}

type NativeTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
function nativeTool(value: unknown): NativeTool | undefined {
  if (!plain(value)) return;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== TOOL_KEYS.size ||
    keys.some((key) => typeof key !== "string" || !TOOL_KEYS.has(key))
  )
    return;
  const name = own(value, "name");
  const description = own(value, "description");
  const parameters = own(value, "parameters");
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(name) ||
    typeof description !== "string" ||
    own(value, "type") !== "function" ||
    own(value, "strict") !== true ||
    !plain(parameters) ||
    own(parameters, "type") !== "object" ||
    Reflect.ownKeys(parameters).some((key) => own(parameters, key) === MISSING)
  )
    return;
  return { name, description, parameters };
}

function registryDescription(action: object): string | undefined {
  const read = (key: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(action, key);
    return descriptor
      ? "value" in descriptor
        ? descriptor.value
        : MISSING
      : undefined;
  };
  const base =
    read("descriptionCompressed") ??
    read("compressedDescription") ??
    read("description");
  const hint = read("routingHint");
  if (typeof base !== "string" || (hint != null && typeof hint !== "string"))
    return;
  // Installed actionToPlannerTool metadata. A protected parent-name alias can
  // share a child's schema but is not the registered parent's canonical tool.
  return hint?.trim() ? `${hint.trim()}\n${base}`.trim() : base;
}

function filterTools(tools: unknown[], actions: unknown[]): unknown[] {
  const protectedNames = new Set(TERMINALS);
  const registry = new Map<
    string,
    { similes: unknown[]; key: string; description?: string }[]
  >();
  const registryCounts = new Map<string, number>();
  for (const action of actions) {
    // Unreadable registry names could hide a canonical collision.
    if (!plain(action)) return tools;
    const name = own(action, "name");
    if (typeof name !== "string" || !identifier(name)) return tools;
    const key = identifier(name);
    protectedNames.add(key);
    registryCounts.set(key, (registryCounts.get(key) ?? 0) + 1);
    const entries = registry.get(name) ?? [];
    entries.push({
      key,
      similes: dataArray(own(action, "similes")) ?? [],
      description: registryDescription(action),
    });
    registry.set(name, entries);
  }
  const toolCounts = new Map<string, number>();
  const normalizedCounts = new Map<string, number>();
  for (const tool of tools) {
    if (tool === null || typeof tool !== "object") continue;
    const nameDescriptor = Object.getOwnPropertyDescriptor(tool, "name");
    if (nameDescriptor && !("value" in nameDescriptor)) return tools;
    const name = own(tool, "name");
    if (typeof name !== "string") continue;
    toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
    const key = identifier(name);
    normalizedCounts.set(key, (normalizedCounts.get(key) ?? 0) + 1);
  }
  const canonical = tools.flatMap((tool) => {
    const native = nativeTool(tool);
    if (!native) return [];
    const entries = registry.get(native.name);
    if (
      entries?.length !== 1 ||
      entries[0].description !== native.description ||
      registryCounts.get(entries[0].key) !== 1 ||
      toolCounts.get(native.name) !== 1 ||
      normalizedCounts.get(entries[0].key) !== 1
    )
      return [];
    return [{ ...native, similes: entries[0].similes }];
  });
  return tools.filter((tool) => {
    const alias = nativeTool(tool);
    if (
      !alias ||
      protectedNames.has(identifier(alias.name)) ||
      toolCounts.get(alias.name) !== 1 ||
      normalizedCounts.get(identifier(alias.name)) !== 1
    )
      return true;
    const matches = canonical.filter(
      (candidate) => candidate.parameters === alias.parameters,
    );
    // Alias ownership may be shared. Only advertisement is replaced: the SDK's
    // original admission tools and independent legacy dispatch remain intact.
    return !(
      matches.length === 1 &&
      matches[0].similes.some(
        (simile) => typeof simile === "string" && simile.trim() === alias.name,
      )
    );
  });
}

export function createPlannerToolExposurePlugin(
  options: { enabled?: boolean } = {},
): Plugin {
  return {
    name: "doolittle-planner-tool-exposure",
    description:
      "Opt-in duplicate alias advertisement policy for native planning.",
    init: (_config, runtime) => {
      runtime.unregisterPipelineHook(PLANNER_TOOL_EXPOSURE_HOOK_ID);
      if (
        !(options.enabled ?? process.env[PLANNER_TOOL_EXPOSURE_FLAG] === "true")
      )
        return;
      runtime.registerPipelineHook({
        id: PLANNER_TOOL_EXPOSURE_HOOK_ID,
        phase: "pre_model",
        schedule: "serial",
        mutatesPrimary: true,
        position: -90,
        handler: (hookRuntime: IAgentRuntime, context) => {
          if (
            context.phase !== "pre_model" ||
            context.requestedModelType !== ModelType.ACTION_PLANNER
          )
            return;
          try {
            if (!plain(context.params)) return;
            const descriptor = Object.getOwnPropertyDescriptor(
              context.params,
              "tools",
            );
            if (!descriptor || !("value" in descriptor) || !descriptor.writable)
              return;
            const tools = dataArray(descriptor.value);
            const actions = dataArray(own(hookRuntime, "actions"));
            if (!tools || !actions) return;
            const filtered = filterTools(tools, actions);
            if (filtered.length !== tools.length)
              context.params.tools = filtered;
          } catch {
            // Optional optimization: no partial edits, payload logs, or refusal.
          }
        },
      });
    },
  };
}
