import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";
import {
  Service as ElizaService,
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  type Plugin,
  type TextEmbeddingParams,
} from "@elizaos/core";

export interface ElizaCloudStatus {
  provider: "elizacloud";
  available: boolean;
  reusable: boolean;
  nativeReady?: boolean;
  source?: string;
  authMode?: string;
  detail: string;
}

interface ElizaCloudPluginOptions {
  enabled?: boolean;
  getStatus: () => ElizaCloudStatus;
  getCredentials?: () =>
    | {
        apiKey?: string;
        source?: string;
        authMode?: string;
      }
    | undefined;
}

const DEFAULT_ELIZA_CLOUD_BASE_URL = resolveCloudApiBaseUrl();
const DEFAULT_ELIZA_CLOUD_SMALL_MODEL = "xai/grok-4.1-fast-non-reasoning";
const DEFAULT_ELIZA_CLOUD_MODEL = "xai/grok-4.1-fast-reasoning";
const DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL = "xai/grok-4.1-fast-reasoning";
const ELIZA_CLOUD_EMPTY_RESPONSE_MODEL_PREFIXES = ["openai/gpt-5"];
const ELIZA_CLOUD_RESPONSES_MODEL_MARKERS = ["xai/grok-"];

function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      model?: { provider?: string };
    };
    return parsed.model?.provider;
  } catch {
    return undefined;
  }
}

function getRuntimeModelSettings(runtime: IAgentRuntime | undefined): {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
} {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: {
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
      };
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}

function getRuntimeStringSetting(
  runtime: IAgentRuntime | undefined,
  key: string,
): string | undefined {
  try {
    const raw = runtime?.getSetting(key);
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  } catch {
    return undefined;
  }
}

function getRuntimeNumberSetting(
  runtime: IAgentRuntime | undefined,
  key: string,
): number | undefined {
  const raw = getRuntimeStringSetting(runtime, key);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveElizaCloudEmbeddingEndpoint(runtime: IAgentRuntime): string {
  const configured = getRuntimeStringSetting(
    runtime,
    "ELIZAOS_CLOUD_EMBEDDING_URL",
  );
  const baseUrl = configured
    ? configured
    : resolveCloudApiBaseUrl(
        getRuntimeModelSettings(runtime).baseUrl ||
          DEFAULT_ELIZA_CLOUD_BASE_URL,
      );
  const normalized = baseUrl.trim().replace(/\/$/, "");
  return normalized.endsWith("/embeddings")
    ? normalized
    : `${normalized}/embeddings`;
}

function resolveElizaCloudEmbeddingModel(runtime: IAgentRuntime): string {
  return (
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_MODEL") ||
    DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL
  );
}

function extractEmbeddingInput(
  params: TextEmbeddingParams | string | null,
): string {
  if (typeof params === "string" && params.trim()) {
    return params.trim();
  }
  if (params && typeof params === "object") {
    const candidate =
      ("text" in params && typeof params.text === "string"
        ? params.text
        : "") ||
      ("input" in params && typeof params.input === "string"
        ? params.input
        : "");
    if (candidate.trim()) {
      return candidate.trim();
    }
  }
  return "embedding dimension probe";
}

function isStructuredPlannerPrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hasPlannerKeys =
    normalized.includes("thought") &&
    normalized.includes("providers") &&
    normalized.includes("action") &&
    normalized.includes("params") &&
    normalized.includes("isfinish");
  const hasJsonConstraint =
    normalized.includes("json") ||
    normalized.includes("schema") ||
    normalized.includes("valid object") ||
    normalized.includes("double quotes");
  return hasPlannerKeys || (hasJsonConstraint && normalized.includes("action"));
}

function resolveElizaCloudModelSelection(
  runtime: IAgentRuntime,
  preferredType: (typeof ModelType)[keyof typeof ModelType],
  prompt: string,
): string {
  const runtimeModel = getRuntimeModelSettings(runtime);
  const configuredSmall =
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_SMALL_MODEL") ||
    DEFAULT_ELIZA_CLOUD_SMALL_MODEL;
  const configuredLarge =
    runtimeModel.model ||
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_LARGE_MODEL") ||
    DEFAULT_ELIZA_CLOUD_MODEL;

  if (isStructuredPlannerPrompt(prompt)) {
    return configuredLarge;
  }

  switch (preferredType) {
    case ModelType.TEXT_SMALL:
    case ModelType.TEXT_REASONING_SMALL:
      return configuredSmall;
    default:
      return configuredLarge;
  }
}

function extractTextFromChatCompletions(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const parsed = payload as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => entry.text ?? "")
      .join("")
      .trim();
  }
  return "";
}

function extractTextFromResponsesApi(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const parsed = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      text?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }

  if (!Array.isArray(parsed.output)) {
    return "";
  }

  return parsed.output
    .flatMap((entry) => {
      if (typeof entry.text === "string" && entry.text.trim()) {
        return [entry.text.trim()];
      }
      if (!Array.isArray(entry.content)) {
        return [];
      }
      return entry.content
        .map((content) =>
          typeof content.text === "string" ? content.text.trim() : "",
        )
        .filter(Boolean);
    })
    .join("\n")
    .trim();
}

function shouldUseResponsesApi(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return ELIZA_CLOUD_RESPONSES_MODEL_MARKERS.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function shouldRetryEmptyCloudResponse(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return ELIZA_CLOUD_EMPTY_RESPONSE_MODEL_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

async function postElizaCloudChatCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateTextParams,
  temperature: number,
  maxTokens: number,
  conversationId?: string,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(conversationId ? { "x-grok-conv-id": conversationId } : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      messages: [
        {
          role: "user",
          content: params.prompt,
        },
      ],
    }),
  });
}

async function postElizaCloudResponse(
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateTextParams,
  maxTokens: number,
  conversationId?: string,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(conversationId ? { "x-grok-conv-id": conversationId } : {}),
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: params.prompt,
        },
      ],
      max_output_tokens: maxTokens,
      store: false,
    }),
  });
}

async function postElizaCloudEmbedding(
  endpoint: string,
  apiKey: string,
  model: string,
  input: string,
  dimensions?: number,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      encoding_format: "float",
      ...(dimensions ? { dimensions } : {}),
    }),
  });
}

function extractEmbeddingVector(payload: unknown): number[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const parsed = payload as {
    data?: Array<{
      embedding?: number[];
    }>;
  };

  const vector = parsed.data?.[0]?.embedding;
  return Array.isArray(vector) ? vector : [];
}

async function runElizaCloudTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: ElizaCloudPluginOptions,
  preferredType: (typeof ModelType)[keyof typeof ModelType],
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "elizacloud") {
    throw new Error(
      `Eliza Cloud model handler is active, but runtime provider is ${provider}. Restart with the Eliza Cloud provider selected to use this plugin directly.`,
    );
  }

  const credentials = options.getCredentials?.();
  const apiKey = credentials?.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "No Eliza Cloud API key is available for managed cloud execution. Run `elizaos login` or set ELIZAOS_CLOUD_API_KEY first.",
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const baseUrl = resolveCloudApiBaseUrl(
    runtimeModel.baseUrl || DEFAULT_ELIZA_CLOUD_BASE_URL,
  );
  const requestedModel = resolveElizaCloudModelSelection(
    runtime,
    preferredType,
    params.prompt,
  );
  const conversationId = getRuntimeStringSetting(
    runtime,
    "ELIZAOS_CLOUD_CONVERSATION_ID",
  );
  const temperature = runtimeModel.temperature ?? 0.4;
  const maxTokens = params.maxTokens ?? runtimeModel.maxTokens ?? 1200;

  if (shouldUseResponsesApi(requestedModel)) {
    const response = await postElizaCloudResponse(
      `${baseUrl}/responses`,
      apiKey,
      requestedModel,
      params,
      maxTokens,
      conversationId,
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Eliza Cloud responses request failed (${response.status}): ${body || "empty response"}`,
      );
    }
    const payload = (await response.json()) as unknown;
    const text = extractTextFromResponsesApi(payload);
    if (text) {
      return text;
    }
    throw new Error(
      `Eliza Cloud responses request returned no output text for ${requestedModel}.`,
    );
  }

  let response = await postElizaCloudChatCompletion(
    `${baseUrl}/chat/completions`,
    apiKey,
    requestedModel,
    params,
    temperature,
    maxTokens,
    conversationId,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Eliza Cloud request failed (${response.status}): ${body || "empty response"}`,
    );
  }

  let payload = (await response.json()) as unknown;
  let text = extractTextFromChatCompletions(payload);
  if (!text && shouldRetryEmptyCloudResponse(requestedModel)) {
    response = await postElizaCloudChatCompletion(
      `${baseUrl}/chat/completions`,
      apiKey,
      ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL,
      params,
      temperature,
      maxTokens,
      conversationId,
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Eliza Cloud fallback request failed (${response.status}): ${body || "empty response"}`,
      );
    }
    payload = (await response.json()) as unknown;
    text = extractTextFromChatCompletions(payload);
  }
  return text || "No response returned.";
}

async function runElizaCloudEmbeddingGeneration(
  runtime: IAgentRuntime,
  params: TextEmbeddingParams | string | null,
  options: ElizaCloudPluginOptions,
): Promise<number[]> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "elizacloud") {
    throw new Error(
      `Eliza Cloud embedding handler is active, but runtime provider is ${provider}. Restart with the Eliza Cloud provider selected to use this plugin directly.`,
    );
  }

  const credentials = options.getCredentials?.();
  const apiKey =
    getRuntimeStringSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_API_KEY") ||
    credentials?.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "No Eliza Cloud embedding API key is available. Set ELIZAOS_CLOUD_EMBEDDING_API_KEY or run `elizaos login`.",
    );
  }

  const response = await postElizaCloudEmbedding(
    resolveElizaCloudEmbeddingEndpoint(runtime),
    apiKey,
    resolveElizaCloudEmbeddingModel(runtime),
    extractEmbeddingInput(params),
    getRuntimeNumberSetting(runtime, "ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS"),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Eliza Cloud embeddings request failed (${response.status}): ${body || "empty response"}`,
    );
  }

  const payload = (await response.json()) as unknown;
  const vector = extractEmbeddingVector(payload);
  if (vector.length > 0) {
    return vector;
  }

  throw new Error(
    "Eliza Cloud embeddings request returned no embedding vector.",
  );
}

export function createElizaCloudPlugin(
  options: ElizaCloudPluginOptions,
): Plugin {
  class ElizaCloudService extends ElizaService {
    static serviceType = "elizacloud";

    capabilityDescription =
      "Managed Eliza Cloud provider bridge for first-party ElizaOS inference.";

    static async start(runtime?: IAgentRuntime): Promise<ElizaCloudService> {
      return new ElizaCloudService(runtime);
    }

    async stop(): Promise<void> {}

    status(): ElizaCloudStatus {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "elizacloud",
        upstreamProvider: "elizacloud",
        available: status.available,
        reusable: status.reusable,
        baseUrl: DEFAULT_ELIZA_CLOUD_BASE_URL,
        authMode: status.authMode ?? "api-key",
        source: status.source,
        detail: status.detail,
      };
    }

    async generateText(params: { prompt: string; maxTokens?: number }) {
      return runElizaCloudTextGeneration(
        this.runtime,
        params,
        options,
        ModelType.TEXT_LARGE,
      );
    }
  }

  return {
    name: "@elizaos/plugin-elizacloud",
    description:
      "Workspace-native Eliza Cloud plugin for managed cloud inference and account-aware runtime routing.",
    services: [ElizaCloudService],
    models: options.enabled
      ? {
          [ModelType.TEXT_SMALL]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_SMALL,
            ),
          [ModelType.TEXT_LARGE]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_LARGE,
            ),
          [ModelType.TEXT_REASONING_SMALL]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_REASONING_SMALL,
            ),
          [ModelType.TEXT_REASONING_LARGE]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_REASONING_LARGE,
            ),
          [ModelType.TEXT_COMPLETION]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_COMPLETION,
            ),
          [ModelType.TEXT_EMBEDDING]: (runtime, params) =>
            runElizaCloudEmbeddingGeneration(runtime, params, options),
        }
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
