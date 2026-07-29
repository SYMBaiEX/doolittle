import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { EnvConfig } from "@/types";

const MODEL_DISCOVERY_TIMEOUT_MS = 2_500;

type ModelSource = "configured" | "discovered";

interface DiscoveredModel {
  id: string;
  label: string;
  source: ModelSource;
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
  models: Array<{ id: string; label?: string }>;
  live: boolean;
}

export async function handleRuntimeModelRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/runtime/models") {
    return null;
  }

  const settings = context.services.settings.get().model;
  const providers = await discoverModelProviders(
    context.config,
    settings.provider,
    settings.model,
  );
  return json({
    activeProvider: settings.provider,
    activeModel: settings.model,
    refreshedAt: new Date().toISOString(),
    providers,
  });
}

export async function discoverModelProviders(
  config: EnvConfig,
  activeProvider: string,
  activeModel: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ModelProvider[]> {
  const definitions = providerDefinitions(config, activeProvider, activeModel);
  const discovered = await Promise.all(
    definitions.map(async (definition) => {
      const result = await discoverProviderModels(
        definition.id,
        definition.baseUrl,
        providerApiKey(config, definition.id),
        fetchImplementation,
      );
      const models = mergeModels(definition.models, result.models);
      return {
        ...definition,
        ready:
          definition.ready ||
          result.live ||
          (definition.id === activeProvider && Boolean(activeModel.trim())),
        discovery: result.live
          ? ("live" as const)
          : definition.ready
            ? ("configured" as const)
            : ("unavailable" as const),
        detail: result.live
          ? `${result.models.length} models discovered from the provider.`
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
): ModelProvider[] {
  const withActive = (provider: string, models: string[]) =>
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
        config.elizaCloudEnabled || config.elizaCloudApiKey?.trim(),
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
      label: "OpenAI Codex",
      mode: "linked",
      ready: config.useLinkedCodexAuth || activeProvider === "codex",
      discovery: "configured",
      detail: "Models exposed by the linked Codex route.",
      models: configuredModels(withActive("codex", [config.openAiModel])),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      mode: "linked",
      ready: config.useLinkedClaudeCodeAuth || activeProvider === "claude-code",
      discovery: "configured",
      detail: "Models exposed by the linked Claude Code route.",
      models: configuredModels(
        withActive("claude-code", [
          config.anthropicLargeModel,
          config.anthropicSmallModel,
        ]),
      ),
    },
    {
      id: "devin",
      label: "Devin",
      mode: "linked",
      ready: config.useLinkedDevinAuth || activeProvider === "devin",
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
      models: configuredModels(withActive("openai", [config.openAiModel])),
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

  const url = modelListUrl(baseUrl);
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

function modelListUrl(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/u, "");
    url.pathname = path.endsWith("/v1")
      ? `${path}/models`
      : `${path}/v1/models`;
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
  values: Array<string | undefined>,
): DiscoveredModel[] {
  return uniqueStrings(values).map((id) => ({
    id,
    label: id,
    source: "configured",
  }));
}

function mergeModels(
  configured: DiscoveredModel[],
  discovered: Array<{ id: string; label?: string }>,
): DiscoveredModel[] {
  const byId = new Map<string, DiscoveredModel>();
  for (const model of configured) byId.set(model.id, model);
  for (const model of discovered) {
    byId.set(model.id, {
      id: model.id,
      label: model.label || model.id,
      source: "discovered",
    });
  }
  return [...byId.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
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
