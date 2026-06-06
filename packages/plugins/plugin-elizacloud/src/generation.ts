import { resolveCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";
import type {
  GenerateTextParams,
  IAgentRuntime,
  ModelType,
  TextEmbeddingParams,
} from "@elizaos/core";
import {
  postElizaCloudChatCompletion,
  postElizaCloudEmbedding,
  postElizaCloudResponse,
} from "./client";
import {
  DEFAULT_ELIZA_CLOUD_BASE_URL,
  ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL,
} from "./constants";
import { resolveModelPromptText } from "./prompt-text";
import {
  extractEmbeddingInput,
  extractEmbeddingVector,
  extractTextFromChatCompletions,
  extractTextFromResponsesApi,
  shouldRetryEmptyCloudResponse,
  shouldUseResponsesApi,
} from "./response-parsing";
import {
  getRuntimeModelSettings,
  getRuntimeNumberSetting,
  getRuntimeProvider,
  getRuntimeStringSetting,
  resolveElizaCloudEmbeddingEndpoint,
  resolveElizaCloudEmbeddingModel,
  resolveElizaCloudModelSelection,
} from "./runtime-settings";
import type { ElizaCloudPluginOptions } from "./types";

export async function runElizaCloudTextGeneration(
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
    resolveModelPromptText(params),
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

export async function runElizaCloudEmbeddingGeneration(
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
