import type { GenerateTextParams } from "@elizaos/core";
import { resolveModelPromptText } from "./prompt-text";

const ELIZA_CLOUD_REQUEST_TIMEOUT_MS = 120_000;

export function elizaCloudRequestSignal(
  params?: GenerateTextParams,
): AbortSignal {
  const callerSignal = (
    params as (GenerateTextParams & { signal?: AbortSignal }) | undefined
  )?.signal;
  const timeoutSignal = AbortSignal.timeout(ELIZA_CLOUD_REQUEST_TIMEOUT_MS);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

export async function postElizaCloudChatCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateTextParams,
  temperature: number,
  maxTokens: number,
  conversationId?: string,
  signal = elizaCloudRequestSignal(params),
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
          content: resolveModelPromptText(params),
        },
      ],
    }),
    signal,
  });
}

export async function postElizaCloudResponse(
  endpoint: string,
  apiKey: string,
  model: string,
  params: GenerateTextParams,
  maxTokens: number,
  conversationId?: string,
  signal = elizaCloudRequestSignal(params),
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
          content: resolveModelPromptText(params),
        },
      ],
      max_output_tokens: maxTokens,
      store: false,
    }),
    signal,
  });
}

export async function postElizaCloudEmbedding(
  endpoint: string,
  apiKey: string,
  model: string,
  input: string,
  dimensions?: number,
  signal = elizaCloudRequestSignal(),
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
    signal,
  });
}
