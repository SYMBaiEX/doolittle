import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import {
  DEFAULT_CODEX_BASE_URL,
  DEFAULT_CODEX_INSTRUCTIONS,
  DEFAULT_CODEX_MODEL,
} from "./constants";
import { resolveModelPromptText } from "./prompt-text";
import { getRuntimeModelSettings, getRuntimeProvider } from "./runtime";
import { readCodexResponseText } from "./sse";
import type { CodexPluginOptions } from "./types";

interface CodexRequestPayload {
  model: string;
  instructions: string;
  input: Array<{
    role: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  }>;
  stream: boolean;
  store: boolean;
}

function createCodexRequestPayload(
  params: GenerateTextParams,
  runtimeModel: { model?: string },
): CodexRequestPayload {
  return {
    model: runtimeModel.model || DEFAULT_CODEX_MODEL,
    instructions: DEFAULT_CODEX_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: resolveModelPromptText(params),
          },
        ],
      },
    ],
    stream: true,
    store: false,
  };
}

export async function runCodexTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: CodexPluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "codex") {
    throw new Error(
      `Codex model handler is active, but runtime provider is ${provider}. Restart with the Codex provider selected to use this plugin directly.`,
    );
  }

  let credentials = options.getCredentials?.();
  if (!credentials?.accessToken?.trim() && options.refreshCredentials) {
    credentials = await options.refreshCredentials();
  }
  const accessToken = credentials?.accessToken?.trim();
  if (!accessToken) {
    throw new Error(
      "No reusable linked Codex access token is available for the Codex provider.",
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const endpoint = `${runtimeModel.baseUrl || DEFAULT_CODEX_BASE_URL}/responses`;
  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createCodexRequestPayload(params, runtimeModel)),
  });

  if (
    (response.status === 401 || response.status === 403) &&
    options.refreshCredentials
  ) {
    const refreshed = await options.refreshCredentials();
    const refreshedAccessToken = refreshed?.accessToken?.trim();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshedAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createCodexRequestPayload(params, runtimeModel)),
      });
    }
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Codex request failed (${response.status}): ${body}`);
  }

  return readCodexResponseText(response);
}
