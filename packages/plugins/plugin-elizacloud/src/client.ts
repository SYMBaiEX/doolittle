import type { GenerateTextParams } from "@elizaos/core";
import { resolveModelPromptText } from "./prompt-text";

export async function postElizaCloudChatCompletion(
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
          content: resolveModelPromptText(params),
        },
      ],
    }),
  });
}

export async function postElizaCloudResponse(
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
          content: resolveModelPromptText(params),
        },
      ],
      max_output_tokens: maxTokens,
      store: false,
    }),
  });
}

export async function postElizaCloudEmbedding(
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
