import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { AppContext } from "@/runtime/bootstrap";
import { getRuntimeProviderAccountsSnapshot } from "@/runtime/native/provider-accounts";
import { json } from "@/server/responses";
import { listRuntimeModelCapabilities } from "@/services/operator/runtime-model-capabilities";
import type { RuntimeReasoningEffort } from "@/services/settings/runtime-settings";
import type { EnvConfig } from "@/types";

const MODEL_DISCOVERY_TIMEOUT_MS = 2_500;

type ModelSource = "configured" | "discovered";

interface ModelCatalogEntry {
  id: string;
  label: string;
  reasoning?: ModelReasoningCapability;
}

interface ModelReasoningOption {
  id: RuntimeReasoningEffort;
  label: string;
  description?: string;
}

interface ModelReasoningCapability {
  default?: RuntimeReasoningEffort;
  options: ModelReasoningOption[];
}

interface DiscoveredModel {
  id: string;
  label: string;
  source: ModelSource;
  reasoning?: ModelReasoningCapability;
}

interface ModelProvider {
  id: string;
  label: string;
  mode: "cloud" | "linked" | "local";
  ready: boolean;
  baseUrl?: string;
  discovery: "configured" | "live" | "unavailable";
  detail: string;
  models: DiscoveredModel[];
}

interface ModelDiscoveryResult {
  models: Array<{
    id: string;
    label?: string;
    reasoning?: ModelReasoningCapability;
  }>;
  live: boolean;
}

type LinkedProviderReadiness = Partial<
  Record<"claude-code" | "codex" | "devin" | "elizacloud", boolean>
>;

const codexReasoning: ModelReasoningCapability = {
  default: "medium",
  options: (["none", "low", "medium", "high", "xhigh", "max"] as const).map(
    (id) => ({ id, label: id === "none" ? "None" : id }),
  ),
};

const claudeReasoning: ModelReasoningCapability = {
  default: "high",
  options: (["low", "medium", "high", "xhigh", "max"] as const).map((id) => ({
    id,
    label: id,
  })),
};

const openAiReasoning: ModelReasoningCapability = {
  default: "medium",
  options: (["minimal", "low", "medium", "high"] as const).map((id) => ({
    id,
    label: id,
  })),
};

function openAiReasoningForModel(
  modelId: string,
): ModelReasoningCapability | undefined {
  const normalized = modelId.trim().toLowerCase();
  return /^(?:gpt-5(?:[.-]|$)|o(?:1|3|4)(?:[.-]|$)|codex(?:[.-]|$))/.test(
    normalized,
  )
    ? openAiReasoning
    : undefined;
}

const CODEX_LINKED_MODELS: ModelCatalogEntry[] = [
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", reasoning: codexReasoning },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    reasoning: codexReasoning,
  },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", reasoning: codexReasoning },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
];

const CLAUDE_CODE_LINKED_MODELS: ModelCatalogEntry[] = [
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    reasoning: claudeReasoning,
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    reasoning: claudeReasoning,
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    reasoning: claudeReasoning,
  },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

export async function handleRuntimeModelRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/runtime/models") {
    return null;
  }

  const settings = context.services.settings.get().model;
  const accounts = getRuntimeProviderAccountsSnapshot(context.runtime);
  const providers = await discoverModelProviders(
    context.config,
    settings.provider,
    settings.model,
    fetch,
    {
      codex: Boolean(accounts.codex.nativeReady || accounts.codex.reusable),
      "claude-code": Boolean(
        accounts.claudeCode.nativeReady || accounts.claudeCode.fallbackReady,
      ),
      devin: Boolean(accounts.devin.nativeReady || accounts.devin.reusable),
      elizacloud: Boolean(
        accounts.elizaCloud.nativeReady || accounts.elizaCloud.reusable,
      ),
    },
  );
  return json({
    activeProvider: settings.provider,
    activeModel: settings.model,
    ...(settings.reasoningEffort
      ? { activeReasoningEffort: settings.reasoningEffort }
      : {}),
    refreshedAt: new Date().toISOString(),
    providers,
    capabilities: listRuntimeModelCapabilities(context.runtime),
  });
}

export async function discoverModelProviders(
  config: EnvConfig,
  activeProvider: string,
  activeModel: string,
  fetchImplementation: typeof fetch = fetch,
  linkedReadiness: LinkedProviderReadiness = {},
): Promise<ModelProvider[]> {
  const definitions = providerDefinitions(
    config,
    activeProvider,
    activeModel,
    linkedReadiness,
  );
  const discovered = await Promise.all(
    definitions.map(async (definition) => {
      const [providerResult, linkedResult] = await Promise.all([
        discoverProviderModels(
          definition.id,
          definition.baseUrl,
          providerApiKey(config, definition.id),
          fetchImplementation,
        ),
        discoverLinkedProviderModels(definition.id),
      ]);
      const live = providerResult.live || linkedResult.live;
      const newlyDiscovered = [
        ...linkedResult.models,
        ...providerResult.models,
      ];
      const models = mergeModels(
        definition.models,
        newlyDiscovered,
        definition.id === "openai" ? openAiReasoningForModel : undefined,
      );
      return {
        ...definition,
        ready: definition.ready || live,
        discovery: live
          ? ("live" as const)
          : definition.ready
            ? ("configured" as const)
            : ("unavailable" as const),
        detail: live
          ? `${newlyDiscovered.length} models discovered from the provider.`
          : definition.detail,
        models,
      };
    }),
  );
  return discovered;
}

function providerDefinitions(
  config: EnvConfig,
  activeProvider: string,
  activeModel: string,
  linkedReadiness: LinkedProviderReadiness,
): ModelProvider[] {
  const withActive = (
    provider: string,
    models: Array<ModelCatalogEntry | string>,
  ) =>
    provider === activeProvider && activeModel.trim()
      ? [activeModel, ...models]
      : models;
  return [
    {
      id: "ollama",
      label: "Ollama",
      mode: "local",
      ready: Boolean(config.ollamaApiEndpoint?.trim()),
      baseUrl: config.ollamaApiEndpoint,
      discovery: "configured",
      detail: "Start Ollama to discover every model installed locally.",
      models: configuredModels(
        withActive("ollama", [
          config.ollamaLargeModel,
          config.ollamaSmallModel,
        ]),
      ),
    },
    {
      id: "elizacloud",
      label: "Eliza Cloud",
      mode: "cloud",
      ready: Boolean(
        config.elizaCloudEnabled ||
          config.elizaCloudApiKey?.trim() ||
          linkedReadiness.elizacloud,
      ),
      baseUrl: config.elizaCloudBaseUrl,
      discovery: "configured",
      detail: "Using the managed Eliza Cloud model configuration.",
      models: configuredModels(
        withActive("elizacloud", [
          config.elizaCloudLargeModel,
          config.elizaCloudSmallModel,
        ]),
      ),
    },
    {
      id: "codex",
      label: "ChatGPT / Codex",
      mode: "linked",
      ready: Boolean(config.useLinkedCodexAuth || linkedReadiness.codex),
      discovery: "configured",
      detail:
        "Current models supported by the linked ChatGPT and Codex account.",
      models: configuredModels(withActive("codex", [...CODEX_LINKED_MODELS])),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      mode: "linked",
      ready: Boolean(
        config.useLinkedClaudeCodeAuth || linkedReadiness["claude-code"],
      ),
      discovery: "configured",
      detail: "Current models supported by the linked Claude Code account.",
      models: configuredModels(
        withActive("claude-code", [...CLAUDE_CODE_LINKED_MODELS]),
      ),
    },
    {
      id: "devin",
      label: "Devin",
      mode: "linked",
      ready: Boolean(config.useLinkedDevinAuth || linkedReadiness.devin),
      discovery: "configured",
      detail: "The model configured for the linked Devin CLI.",
      models: configuredModels(withActive("devin", [config.devinModel])),
    },
    {
      id: "openai",
      label: "OpenAI",
      mode: "cloud",
      ready: Boolean(config.openAiApiKey?.trim()),
      baseUrl: config.openAiBaseUrl,
      discovery: "configured",
      detail: config.openAiApiKey?.trim()
        ? "The provider did not return a live model catalog."
        : "Add an OpenAI API key to discover available models.",
      models: configuredModels(
        withActive("openai", [
          {
            id: config.openAiModel,
            label: config.openAiModel,
            reasoning: openAiReasoningForModel(config.openAiModel),
          },
        ]),
      ),
    },
    {
      id: "anthropic",
      label: "Anthropic",
      mode: "cloud",
      ready: Boolean(config.anthropicApiKey?.trim()),
      baseUrl: config.anthropicBaseUrl ?? "https://api.anthropic.com/v1",
      discovery: "configured",
      detail: config.anthropicApiKey?.trim()
        ? "The provider did not return a live model catalog."
        : "Add an Anthropic API key to discover available models.",
      models: configuredModels(
        withActive("anthropic", [
          config.anthropicLargeModel,
          config.anthropicSmallModel,
        ]),
      ),
    },
  ];
}

async function discoverProviderModels(
  provider: string,
  baseUrl: string | undefined,
  apiKey: string | undefined,
  fetchImplementation: typeof fetch,
): Promise<ModelDiscoveryResult> {
  if (!baseUrl?.trim()) return { models: [], live: false };
  if (
    provider !== "ollama" &&
    provider !== "openai" &&
    provider !== "anthropic" &&
    provider !== "elizacloud"
  ) {
    return { models: [], live: false };
  }
  if (provider !== "ollama" && !apiKey?.trim()) {
    return { models: [], live: false };
  }

  const url = modelListUrl(provider, baseUrl);
  if (!url) return { models: [], live: false };
  const headers = new Headers({ Accept: "application/json" });
  if (provider === "anthropic") {
    headers.set("x-api-key", apiKey ?? "");
    headers.set("anthropic-version", "2023-06-01");
  } else if (apiKey?.trim()) {
    headers.set("Authorization", `Bearer ${apiKey.trim()}`);
  }

  try {
    const response = await fetchImplementation(url, {
      headers,
      signal: AbortSignal.timeout(MODEL_DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) return { models: [], live: false };
    const body = (await response.json()) as unknown;
    const models = parseModelList(body);
    return { models, live: true };
  } catch {
    return { models: [], live: false };
  }
}

async function discoverLinkedProviderModels(
  provider: string,
): Promise<ModelDiscoveryResult> {
  if (provider !== "codex") return { models: [], live: false };
  const codexHome =
    process.env.CODEX_HOME?.trim() || resolve(homedir(), ".codex");
  try {
    const body = JSON.parse(
      await readFile(resolve(codexHome, "models_cache.json"), "utf8"),
    ) as unknown;
    const models = parseCodexModelCache(body);
    return { models, live: models.length > 0 };
  } catch {
    return { models: [], live: false };
  }
}

export function parseCodexModelCache(value: unknown): Array<{
  id: string;
  label?: string;
  reasoning?: ModelReasoningCapability;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries = (value as Record<string, unknown>).models;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap(
    (
      entry,
    ): Array<{
      id: string;
      label?: string;
      reasoning?: ModelReasoningCapability;
    }> => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return [];
      const model = entry as Record<string, unknown>;
      if (model.visibility === "hide") return [];
      const id = typeof model.slug === "string" ? model.slug.trim() : "";
      if (!id) return [];
      const label =
        typeof model.display_name === "string" && model.display_name.trim()
          ? model.display_name.trim()
          : undefined;
      const reasoning = parseCodexReasoningCapability(model);
      return [
        {
          id,
          ...(label ? { label } : {}),
          ...(reasoning ? { reasoning } : {}),
        },
      ];
    },
  );
}

function parseCodexReasoningCapability(
  model: Record<string, unknown>,
): ModelReasoningCapability | undefined {
  const supported = model.supported_reasoning_levels;
  if (!Array.isArray(supported)) return undefined;
  const options = supported.flatMap((entry): ModelReasoningOption[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const id = record.effort;
    if (
      typeof id !== "string" ||
      ![
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        "ultra",
      ].includes(id)
    ) {
      return [];
    }
    const description =
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : undefined;
    return [
      {
        id: id as RuntimeReasoningEffort,
        label: id,
        ...(description ? { description } : {}),
      },
    ];
  });
  if (!options.length) return undefined;
  const defaultEffort = model.default_reasoning_level;
  return {
    options,
    ...(typeof defaultEffort === "string" &&
    options.some((option) => option.id === defaultEffort)
      ? { default: defaultEffort as RuntimeReasoningEffort }
      : {}),
  };
}

function modelListUrl(provider: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/u, "");
    if (provider === "ollama") {
      const apiBoundary = path.match(/^(.*?)(?:\/api|\/v1)(?:\/.*)?$/u);
      const prefix = apiBoundary?.[1] ?? path;
      url.pathname = `${prefix}/api/tags`.replace(/\/{2,}/gu, "/");
    } else {
      url.pathname = path.endsWith("/v1")
        ? `${path}/models`
        : `${path}/v1/models`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseModelList(value: unknown): Array<{ id: string; label?: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  return entries
    .flatMap((entry): Array<{ id: string; label?: string }> => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const model = entry as Record<string, unknown>;
      const id = [model.id, model.name, model.model].find(
        (candidate) =>
          typeof candidate === "string" && candidate.trim().length > 0,
      );
      if (typeof id !== "string") return [];
      const label =
        typeof model.display_name === "string" && model.display_name.trim()
          ? model.display_name.trim()
          : undefined;
      return [{ id: id.trim(), ...(label ? { label } : {}) }];
    })
    .slice(0, 500);
}

function configuredModels(
  values: Array<ModelCatalogEntry | string | undefined>,
): DiscoveredModel[] {
  const byId = new Map<string, DiscoveredModel>();
  for (const value of values) {
    if (!value) continue;
    const id = typeof value === "string" ? value.trim() : value.id.trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      if (typeof value !== "string") {
        byId.set(id, {
          ...existing,
          ...(existing.label === existing.id
            ? { label: value.label.trim() || id }
            : {}),
          ...(value.reasoning ? { reasoning: value.reasoning } : {}),
        });
      }
      continue;
    }
    byId.set(id, {
      id,
      label:
        typeof value === "string" ? id : value.label.trim() || value.id.trim(),
      source: "configured",
      ...(typeof value !== "string" && value.reasoning
        ? { reasoning: value.reasoning }
        : {}),
    });
  }
  return [...byId.values()];
}

function mergeModels(
  configured: DiscoveredModel[],
  discovered: Array<{
    id: string;
    label?: string;
    reasoning?: ModelReasoningCapability;
  }>,
  fallbackReasoning?: (modelId: string) => ModelReasoningCapability | undefined,
): DiscoveredModel[] {
  const byId = new Map<string, DiscoveredModel>();
  for (const model of configured) byId.set(model.id, model);
  for (const model of discovered) {
    const reasoning = model.reasoning ?? fallbackReasoning?.(model.id);
    byId.set(model.id, {
      id: model.id,
      label: model.label || model.id,
      source: "discovered",
      ...(reasoning ? { reasoning } : {}),
    });
  }
  return [...byId.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function providerApiKey(
  config: EnvConfig,
  provider: string,
): string | undefined {
  if (provider === "openai") return config.openAiApiKey;
  if (provider === "anthropic") return config.anthropicApiKey;
  if (provider === "elizacloud") return config.elizaCloudApiKey;
  return undefined;
}
