import {
  Service as ElizaService,
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  type Plugin,
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

const DEFAULT_ELIZA_CLOUD_BASE_URL = "https://www.elizacloud.ai/api/v1";
const DEFAULT_ELIZA_CLOUD_MODEL = "xai/grok-4.20-multi-agent";
const ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL = "xai/grok-4.20-multi-agent";
const ELIZA_CLOUD_EMPTY_RESPONSE_MODEL_PREFIXES = ["openai/gpt-5"];

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

async function runElizaCloudTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: ElizaCloudPluginOptions,
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
  const endpoint = `${runtimeModel.baseUrl || DEFAULT_ELIZA_CLOUD_BASE_URL}/chat/completions`;
  const requestedModel = runtimeModel.model || DEFAULT_ELIZA_CLOUD_MODEL;
  const temperature = runtimeModel.temperature ?? 0.4;
  const maxTokens = params.maxTokens ?? runtimeModel.maxTokens ?? 1200;
  let response = await postElizaCloudChatCompletion(
    endpoint,
    apiKey,
    requestedModel,
    params,
    temperature,
    maxTokens,
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
      endpoint,
      apiKey,
      ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL,
      params,
      temperature,
      maxTokens,
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
      return runElizaCloudTextGeneration(this.runtime, params, options);
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
            runElizaCloudTextGeneration(runtime, params, options),
          [ModelType.TEXT_LARGE]: (runtime, params) =>
            runElizaCloudTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_SMALL]: (runtime, params) =>
            runElizaCloudTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_LARGE]: (runtime, params) =>
            runElizaCloudTextGeneration(runtime, params, options),
          [ModelType.TEXT_COMPLETION]: (runtime, params) =>
            runElizaCloudTextGeneration(runtime, params, options),
        }
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
